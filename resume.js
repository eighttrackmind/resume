/**
 * almond 0.2.7 Copyright (c) 2011-2012, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/almond for details
 */
//Going sloppy to avoid 'use strict' string cost, but strict practices should
//be followed.
/*jslint sloppy: true */
/*global setTimeout: false */

var requirejs, require, define;
(function (undef) {
    var main, req, makeMap, handlers,
        defined = {},
        waiting = {},
        config = {},
        defining = {},
        hasOwn = Object.prototype.hasOwnProperty,
        aps = [].slice;

    function hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
    }

    /**
     * Given a relative module name, like ./something, normalize it to
     * a real name that can be mapped to a path.
     * @param {String} name the relative name
     * @param {String} baseName a real name that the name arg is relative
     * to.
     * @returns {String} normalized name
     */
    function normalize(name, baseName) {
        var nameParts, nameSegment, mapValue, foundMap,
            foundI, foundStarMap, starI, i, j, part,
            baseParts = baseName && baseName.split("/"),
            map = config.map,
            starMap = (map && map['*']) || {};

        //Adjust any relative paths.
        if (name && name.charAt(0) === ".") {
            //If have a base name, try to normalize against it,
            //otherwise, assume it is a top-level require that will
            //be relative to baseUrl in the end.
            if (baseName) {
                //Convert baseName to array, and lop off the last part,
                //so that . matches that "directory" and not name of the baseName's
                //module. For instance, baseName of "one/two/three", maps to
                //"one/two/three.js", but we want the directory, "one/two" for
                //this normalization.
                baseParts = baseParts.slice(0, baseParts.length - 1);

                name = baseParts.concat(name.split("/"));

                //start trimDots
                for (i = 0; i < name.length; i += 1) {
                    part = name[i];
                    if (part === ".") {
                        name.splice(i, 1);
                        i -= 1;
                    } else if (part === "..") {
                        if (i === 1 && (name[2] === '..' || name[0] === '..')) {
                            //End of the line. Keep at least one non-dot
                            //path segment at the front so it can be mapped
                            //correctly to disk. Otherwise, there is likely
                            //no path mapping for a path starting with '..'.
                            //This can still fail, but catches the most reasonable
                            //uses of ..
                            break;
                        } else if (i > 0) {
                            name.splice(i - 1, 2);
                            i -= 2;
                        }
                    }
                }
                //end trimDots

                name = name.join("/");
            } else if (name.indexOf('./') === 0) {
                // No baseName, so this is ID is resolved relative
                // to baseUrl, pull off the leading dot.
                name = name.substring(2);
            }
        }

        //Apply map config if available.
        if ((baseParts || starMap) && map) {
            nameParts = name.split('/');

            for (i = nameParts.length; i > 0; i -= 1) {
                nameSegment = nameParts.slice(0, i).join("/");

                if (baseParts) {
                    //Find the longest baseName segment match in the config.
                    //So, do joins on the biggest to smallest lengths of baseParts.
                    for (j = baseParts.length; j > 0; j -= 1) {
                        mapValue = map[baseParts.slice(0, j).join('/')];

                        //baseName segment has  config, find if it has one for
                        //this name.
                        if (mapValue) {
                            mapValue = mapValue[nameSegment];
                            if (mapValue) {
                                //Match, update name to the new value.
                                foundMap = mapValue;
                                foundI = i;
                                break;
                            }
                        }
                    }
                }

                if (foundMap) {
                    break;
                }

                //Check for a star map match, but just hold on to it,
                //if there is a shorter segment match later in a matching
                //config, then favor over this star map.
                if (!foundStarMap && starMap && starMap[nameSegment]) {
                    foundStarMap = starMap[nameSegment];
                    starI = i;
                }
            }

            if (!foundMap && foundStarMap) {
                foundMap = foundStarMap;
                foundI = starI;
            }

            if (foundMap) {
                nameParts.splice(0, foundI, foundMap);
                name = nameParts.join('/');
            }
        }

        return name;
    }

    function makeRequire(relName, forceSync) {
        return function () {
            //A version of a require function that passes a moduleName
            //value for items that may need to
            //look up paths relative to the moduleName
            return req.apply(undef, aps.call(arguments, 0).concat([relName, forceSync]));
        };
    }

    function makeNormalize(relName) {
        return function (name) {
            return normalize(name, relName);
        };
    }

    function makeLoad(depName) {
        return function (value) {
            defined[depName] = value;
        };
    }

    function callDep(name) {
        if (hasProp(waiting, name)) {
            var args = waiting[name];
            delete waiting[name];
            defining[name] = true;
            main.apply(undef, args);
        }

        if (!hasProp(defined, name) && !hasProp(defining, name)) {
            throw new Error('No ' + name);
        }
        return defined[name];
    }

    //Turns a plugin!resource to [plugin, resource]
    //with the plugin being undefined if the name
    //did not have a plugin prefix.
    function splitPrefix(name) {
        var prefix,
            index = name ? name.indexOf('!') : -1;
        if (index > -1) {
            prefix = name.substring(0, index);
            name = name.substring(index + 1, name.length);
        }
        return [prefix, name];
    }

    /**
     * Makes a name map, normalizing the name, and using a plugin
     * for normalization if necessary. Grabs a ref to plugin
     * too, as an optimization.
     */
    makeMap = function (name, relName) {
        var plugin,
            parts = splitPrefix(name),
            prefix = parts[0];

        name = parts[1];

        if (prefix) {
            prefix = normalize(prefix, relName);
            plugin = callDep(prefix);
        }

        //Normalize according
        if (prefix) {
            if (plugin && plugin.normalize) {
                name = plugin.normalize(name, makeNormalize(relName));
            } else {
                name = normalize(name, relName);
            }
        } else {
            name = normalize(name, relName);
            parts = splitPrefix(name);
            prefix = parts[0];
            name = parts[1];
            if (prefix) {
                plugin = callDep(prefix);
            }
        }

        //Using ridiculous property names for space reasons
        return {
            f: prefix ? prefix + '!' + name : name, //fullName
            n: name,
            pr: prefix,
            p: plugin
        };
    };

    function makeConfig(name) {
        return function () {
            return (config && config.config && config.config[name]) || {};
        };
    }

    handlers = {
        require: function (name) {
            return makeRequire(name);
        },
        exports: function (name) {
            var e = defined[name];
            if (typeof e !== 'undefined') {
                return e;
            } else {
                return (defined[name] = {});
            }
        },
        module: function (name) {
            return {
                id: name,
                uri: '',
                exports: defined[name],
                config: makeConfig(name)
            };
        }
    };

    main = function (name, deps, callback, relName) {
        var cjsModule, depName, ret, map, i,
            args = [],
            callbackType = typeof callback,
            usingExports;

        //Use name if no relName
        relName = relName || name;

        //Call the callback to define the module, if necessary.
        if (callbackType === 'undefined' || callbackType === 'function') {
            //Pull out the defined dependencies and pass the ordered
            //values to the callback.
            //Default to [require, exports, module] if no deps
            deps = !deps.length && callback.length ? ['require', 'exports', 'module'] : deps;
            for (i = 0; i < deps.length; i += 1) {
                map = makeMap(deps[i], relName);
                depName = map.f;

                //Fast path CommonJS standard dependencies.
                if (depName === "require") {
                    args[i] = handlers.require(name);
                } else if (depName === "exports") {
                    //CommonJS module spec 1.1
                    args[i] = handlers.exports(name);
                    usingExports = true;
                } else if (depName === "module") {
                    //CommonJS module spec 1.1
                    cjsModule = args[i] = handlers.module(name);
                } else if (hasProp(defined, depName) ||
                           hasProp(waiting, depName) ||
                           hasProp(defining, depName)) {
                    args[i] = callDep(depName);
                } else if (map.p) {
                    map.p.load(map.n, makeRequire(relName, true), makeLoad(depName), {});
                    args[i] = defined[depName];
                } else {
                    throw new Error(name + ' missing ' + depName);
                }
            }

            ret = callback ? callback.apply(defined[name], args) : undefined;

            if (name) {
                //If setting exports via "module" is in play,
                //favor that over return value and exports. After that,
                //favor a non-undefined return value over exports use.
                if (cjsModule && cjsModule.exports !== undef &&
                        cjsModule.exports !== defined[name]) {
                    defined[name] = cjsModule.exports;
                } else if (ret !== undef || !usingExports) {
                    //Use the return value from the function.
                    defined[name] = ret;
                }
            }
        } else if (name) {
            //May just be an object definition for the module. Only
            //worry about defining if have a module name.
            defined[name] = callback;
        }
    };

    requirejs = require = req = function (deps, callback, relName, forceSync, alt) {
        if (typeof deps === "string") {
            if (handlers[deps]) {
                //callback in this case is really relName
                return handlers[deps](callback);
            }
            //Just return the module wanted. In this scenario, the
            //deps arg is the module name, and second arg (if passed)
            //is just the relName.
            //Normalize module name, if it contains . or ..
            return callDep(makeMap(deps, callback).f);
        } else if (!deps.splice) {
            //deps is a config object, not an array.
            config = deps;
            if (callback.splice) {
                //callback is an array, which means it is a dependency list.
                //Adjust args if there are dependencies
                deps = callback;
                callback = relName;
                relName = null;
            } else {
                deps = undef;
            }
        }

        //Support require(['a'])
        callback = callback || function () {};

        //If relName is a function, it is an errback handler,
        //so remove it.
        if (typeof relName === 'function') {
            relName = forceSync;
            forceSync = alt;
        }

        //Simulate async callback;
        if (forceSync) {
            main(undef, deps, callback, relName);
        } else {
            //Using a non-zero value because of concern for what old browsers
            //do, and latest browsers "upgrade" to 4 if lower value is used:
            //http://www.whatwg.org/specs/web-apps/current-work/multipage/timers.html#dom-windowtimers-settimeout:
            //If want a value immediately, use require('id') instead -- something
            //that works in almond on the global level, but not guaranteed and
            //unlikely to work in other AMD implementations.
            setTimeout(function () {
                main(undef, deps, callback, relName);
            }, 4);
        }

        return req;
    };

    /**
     * Just drops the config on the floor, but returns req in case
     * the config return value is used.
     */
    req.config = function (cfg) {
        config = cfg;
        if (config.deps) {
            req(config.deps, config.callback);
        }
        return req;
    };

    /**
     * Expose module registry for debugging and tooling
     */
    requirejs._defined = defined;

    define = function (name, deps, callback) {

        //This module may not have dependencies
        if (!deps.splice) {
            //deps is not an array, so probably means
            //an object literal or factory function for
            //the value. Adjust args.
            callback = deps;
            deps = [];
        }

        if (!hasProp(defined, name) && !hasProp(waiting, name)) {
            waiting[name] = [name, deps, callback];
        }
    };

    define.amd = {
        jQuery: true
    };
}());
;(function () {
require.config({
  paths: {
    annie: '../node_modules/annie/annie',
    GMaps: '../node_modules/gmaps/gmaps',
    microbox: '../node_modules/microbox/microbox',
    strftime: '../node_modules/strftime/strftime',
    umodel: '../node_modules/umodel/umodel',
    uxhr: '../node_modules/uxhr/uxhr',
    u: '../node_modules/u/u'
  },
  shim: {
    strftime: {
      exports: 'strftime'
    }
  }
});

define("config", function(){});

(function (root, factory) {
	if (typeof exports === 'object') {
		module.exports = factory();
	} else if (typeof define === 'function' && define.amd) {
		define('annie',[], factory);
	} else {
		root.annie = factory();
	}
}(this,function(){

	

	var doc = document,
		nav = navigator,
		win = window,
		annie = {};


	// internet explorer version (or `undefined` if not ie)
	annie.ie = nav.appVersion.search('MSIE') > -1
		? parseInt(nav.appVersion.slice(22,26), 10)
		: false;


	// window.performance support for more accurate animation timing
	annie.performance = !!(win.performance && win.performance.now);


	// browser vendor (for css/js property prefixing)
	annie.vendor = (function(){

		if (annie.ie && annie.ie < 9) {
			return 'ms';
		}

		var prefixes = ' O ms Moz Webkit'.split(' '),
			style = doc.body.style,
			n,
			prefix,
			property;

		for (n = prefixes.length; n--;) {

			prefix = prefixes[n];
			property = prefix !== '' ? prefix + 'Transform' : 'transform';

			if (style[property] !== void 0) {
				return prefix;
			}
		}

	})();


	// requestAnimationFrame (fallback to `setTimeout` anniefill)
	annie.requestAnimationFrame = bind(
			win.requestAnimationFrame
			|| win[annie.vendor + 'RequestAnimationFrame']
			|| (function(){
				var lastTime = 0;
				return function (callback) {
					var currTime = +new Date();
					var timeToCall = Math.max(0, 16 - (currTime - lastTime));
					var id = setTimeout(function(){ callback(currTime+timeToCall) }, timeToCall);
					lastTime = currTime + timeToCall;
					return id;
				}
			})()
		, win);


	// cancelAnimationFrame
	annie.cancelAnimationFrame = bind(
			win.cancelAnimationFrame
			|| win.cancelRequestAnimationFrame
			|| win[annie.vendor + 'CancelAnimationFrame']
			|| win[annie.vendor + 'CancelRequestAnimationFrame']
			|| clearTimeout
		, win);


	// CSS3 transform
	annie.transform = (function() {
		
		var property = annie.vendor + 'Transform';

		if (doc.body.style[property] !== void 0) {
			return property;
		}

	})();


	// 3d animation support flag
	// based on stackoverflow.com/questions/5661671/detecting-transform-translate3d-support/12621264#12621264
	annie['3d'] = (function(){

		var transform = annie.transform;

		if (!transform) {
			return false;
		}

		var body = doc.body,
			element = doc.createElement('p');

		element.style[transform] = 'translate3d(1px,1px,1px)';
		body.appendChild(element);
		var has3d = getCompStyle(element, transform);
		body.removeChild(element);

		return has3d !== void 0 && has3d !== 'none' && has3d.length > 0;

	})();



	// export
	return annie;



	// helpers
	function bind (fn, context) {
		return function() {
			fn.apply(context, [].slice.call(arguments));
		}
	}
	function getCompStyle (element, property) {
		return (element.currentStyle || getComputedStyle(element))[property];
	}



}));
(function(root, factory) {
    if(typeof exports === 'object') {
        module.exports = factory();
    }
    else if(typeof define === 'function' && define.amd) {
        define('u', [], factory);
    }
    else {
        root.u = factory();
    }
}(this, function() {
var u,
  __hasProp = {}.hasOwnProperty,
  __slice = [].slice;

u = {
  each: function(collection, fn) {
    var key, value, _i, _len;
    if (typeof collection.length !== 'undefined') {
      for (key = _i = 0, _len = collection.length; _i < _len; key = ++_i) {
        value = collection[key];
        fn(value, key);
      }
    } else {
      for (key in collection) {
        if (!__hasProp.call(collection, key)) continue;
        value = collection[key];
        fn(value, key);
      }
    }
    return void 0;
  },
  extend: function() {
    var key, obj, other, others, _i, _len;
    obj = arguments[0], others = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
    if (obj && others) {
      for (_i = 0, _len = others.length; _i < _len; _i++) {
        other = others[_i];
        for (key in other) {
          obj[key] = other[key];
        }
      }
    }
    return obj;
  },
  fluent: function(fn) {
    return function() {
      fn.apply(this, arguments);
      return this;
    };
  },
  one: function(collection) {
    var id;
    for (id in collection) {
      return id;
    }
  },
  keys: function(object) {
    var key, keys;
    keys = [];
    for (key in object) {
      if (!__hasProp.call(object, key)) continue;
      keys.push(key);
    }
    return keys;
  },
  classList: {
    add: function(element, className) {
      if (!u.classList.contains(element, className)) {
        if (element.className.baseVal != null) {
          return element.setAttribute('class', "" + element.className.baseVal + " className");
        } else {
          return element.className += " " + className;
        }
      }
    },
    remove: function(element, className) {
      var regex;
      regex = new RegExp("(^|\\s)" + className + "(?:\\s|$)");
      if (element.className.baseVal != null) {
        return element.setAttribute('class', (element.className.baseVal + '').replace(regex, '$1'));
      } else {
        return element.className = (element.className + '').replace(regex, '$1');
      }
    },
    toggle: function(element, className) {
      var verb;
      if (u.classList.contains(element, className)) {
        verb = 'remove';
      } else {
        verb = 'add';
      }
      return u.classList[verb](element, className);
    },
    contains: function(element, className) {
      var cName;
      if (element.className.baseVal != null) {
        cName = element.className.baseVal;
      } else {
        cName = element.className;
      }
      return (cName.indexOf(className)) > -1;
    }
  }
};

    return u;
}));

var __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };

define('throbber',['require','u'],function(require) {
  var Throbber, u;
  u = require('u');
  return Throbber = (function() {
    Throbber.prototype.options = {
      duration: 500,
      easing: 'linear',
      size: 10,
      text: 'click me!'
    };

    function Throbber(bubble, graph) {
      this.bubble = bubble;
      this.graph = graph;
      this.clear = __bind(this.clear, this);
      this.throb = __bind(this.throb, this);
      this.state = true;
      this.r = this.bubble.attr('r');
      this.x = this.bubble.attr('cx');
      this.y = this.bubble.attr('cy');
      this.throb();
      this.showMessage();
    }

    Throbber.prototype.throb = function() {
      this.state = !this.state;
      return this.bubble.animate({
        r: this.r + (this.state ? this.options.size : 0)
      }, this.options.duration, this.options.easing, this.throb);
    };

    Throbber.prototype.clear = function() {
      var _this = this;
      this.bubble.stop();
      u.classList.add(this.text, 'fade-out');
      return setTimeout(function() {
        return document.body.removeChild(_this.text);
      }, 2000);
    };

    Throbber.prototype.showMessage = function() {
      var element;
      element = this.text = document.createElement('div');
      element.id = 'clickme';
      element.innerHTML = this.options.text;
      element.style.cssText = "left:" + (this.x - this.r) + "px; top:" + this.y + "px";
      document.body.appendChild(element);
      element.style.marginLeft = "" + (this.r - element.offsetWidth / 2) + "px";
      u.classList.add(element, 'fade-in');
      return this.attachMessageEvents();
    };

    Throbber.prototype.attachMessageEvents = function() {
      var _this = this;
      this.text.addEventListener('mouseover', function() {
        return _this.graph.over(_this.bubble);
      });
      this.text.addEventListener('mouseout', function() {
        return _this.graph.out(_this.bubble);
      });
      return this.text.addEventListener('click', function() {
        return _this.graph.click(_this.bubble);
      });
    };

    return Throbber;

  })();
});

(function(root, factory) {
    if(typeof exports === 'object') {
        module.exports = factory();
    }
    else if(typeof define === 'function' && define.amd) {
        define('umodel', [], factory);
    }
    else {
        root.umodel = factory();
    }
}(this, function() {
var umodel, _,
  __hasProp = {}.hasOwnProperty;

_ = {
  extend: function(a, b) {
    var key;
    for (key in b) {
      if (!__hasProp.call(b, key)) continue;
      a[key] = b[key];
    }
    return a;
  },
  trim: (function() {
    var head, tail;
    if (''.trim) {
      return function(string) {
        return string.trim();
      };
    } else {
      head = /^\s\s*/;
      tail = /\s\s*$/;
      return function(string) {
        return string.replace(head, '').replace(tail, '');
      };
    }
  })()
};

umodel = (function() {
  function umodel(_data, options) {
    this._data = _data != null ? _data : {};
    this.options = {
      separator: '/'
    };
    if (options) {
      _.extend(this.options, options);
    }
    this.events = {};
  }

  umodel.prototype.get = function(key) {
    this.trigger('get', key);
    return this._get(this._split(key), this._data);
  };

  umodel.prototype.set = function(key, value) {
    var old;
    old = this._get(this._split(key), this._data);
    this._set(this._split(key), value, false, this._data);
    return this.trigger('set', key, value, old);
  };

  umodel.prototype.setnx = function(key, value) {
    var old;
    old = this._get(this._split(key), this._data);
    this._set(this._split(key), value, true, this._data);
    return this.trigger('setnx', key, value, old);
  };

  umodel.prototype.on = function(eventAndProperty, fn) {
    var e, _results;
    if (fn) {
      return this._on(eventAndProperty, fn);
    } else {
      _results = [];
      for (e in eventAndProperty) {
        fn = eventAndProperty[e];
        _results.push(this._on(e, fn));
      }
      return _results;
    }
  };

  umodel.prototype.trigger = function(event, path, value, oldValue) {
    var e, fn, fns, _ref, _results;
    if (path == null) {
      path = '*';
    }
    path = this._normalize(path);
    if (event in this.events) {
      _ref = this.events[event];
      _results = [];
      for (e in _ref) {
        fns = _ref[e];
        if (e === '*' || (path + '/').indexOf(e + '/') === 0) {
          _results.push((function() {
            var _i, _len, _results1;
            _results1 = [];
            for (_i = 0, _len = fns.length; _i < _len; _i++) {
              fn = fns[_i];
              if (oldValue != null) {
                _results1.push(fn.call(this, path, value, oldValue));
              } else {
                _results1.push(fn.call(this, path, value));
              }
            }
            return _results1;
          }).call(this));
        } else {
          _results.push(void 0);
        }
      }
      return _results;
    }
  };

  umodel.prototype._get = function(key, parent, accumulator) {
    var head;
    if (accumulator == null) {
      accumulator = [];
    }
    head = key.shift();
    if (head) {
      if (!(head in parent)) {
        return void 0;
      }
      accumulator.push(head);
      return this._get(key, parent[head], accumulator);
    }
    return parent;
  };

  umodel.prototype._set = function(key, value, nx, parent, accumulator) {
    var head;
    if (nx == null) {
      nx = false;
    }
    if (accumulator == null) {
      accumulator = [];
    }
    head = key.shift();
    if (key.length) {
      if (!(head in parent)) {
        parent[head] = {};
      }
      accumulator.push(head);
      return this._set(key, value, nx, parent[head], accumulator);
    }
    if (!(nx && head in parent)) {
      return parent[head] = value;
    }
  };

  umodel.prototype._on = function(eventAndProperty, fn) {
    var event, events, parts, property, _i, _len, _results;
    parts = eventAndProperty.split(':');
    events = parts[0].split(' ');
    property = this._normalize(parts[1] || '*');
    _results = [];
    for (_i = 0, _len = events.length; _i < _len; _i++) {
      event = events[_i];
      event = _.trim(event);
      if (!(event in this.events)) {
        this.events[event] = {};
      }
      if (!(property in this.events[event])) {
        this.events[event][property] = [];
      }
      _results.push(this.events[event][property].push(fn));
    }
    return _results;
  };

  umodel.prototype._normalize = function(key) {
    var separator;
    separator = this.options.separator;
    key = _.trim(key);
    if (key.charAt(0) === separator) {
      key = key.slice(1);
    }
    if (key.charAt(key.length - 1) === separator) {
      key = key.slice(0, -1);
    }
    return key;
  };

  umodel.prototype._split = function(key) {
    return (this._normalize(key)).split(this.options.separator);
  };

  return umodel;

})();

    return umodel;
}));

define('util',['require'],function(require) {
  var util;
  return util = {
    strtotime: function(string) {
      return new Date("" + string + "-01T12:00:00");
    },
    log: function(message) {
      var time;
      time = +new Date();
      if (!this.time) {
        this.time = time;
      }
      console.log(message, " (" + (time - this.time) + "ms)");
      return this.time = time;
    }
  };
});

var __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };

define('bubblegraph',['require','throbber','umodel','util','u'],function(require) {
  var BubbleGraph, Throbber, u, umodel, util;
  Throbber = require('throbber');
  umodel = require('umodel');
  util = require('util');
  u = require('u');
  return BubbleGraph = (function() {
    BubbleGraph.prototype.options = {
      colors: [],
      data: {},
      element: document.body
    };

    BubbleGraph.prototype.model = new umodel({
      bubbles: {},
      throbber: null
    });

    BubbleGraph.prototype.animations = {
      active: Raphael.animation({
        opacity: 1,
        'stroke-width': 5
      }, 200),
      inactive: Raphael.animation({
        opacity: .5,
        'stroke-width': 0
      }, 200),
      over: Raphael.animation({
        opacity: .7
      }, 200),
      out: Raphael.animation({
        opacity: .5
      }, 200)
    };

    function BubbleGraph(options) {
      this.out = __bind(this.out, this);
      this.over = __bind(this.over, this);
      this.click = __bind(this.click, this);
      _.extend(this.options, options);
      this.render();
    }

    BubbleGraph.prototype.render = function() {
      var data, days, diff, height, item, last, max, paper, prev, size, spans, time, _i, _len,
        _this = this;
      data = this.options.data;
      size = this.options.element.getBoundingClientRect();
      height = size.height / 3;
      paper = Raphael(this.options.element, size.width, size.height);
      for (_i = 0, _len = data.length; _i < _len; _i++) {
        item = data[_i];
        time = item.when;
        if (time != null) {
          time[0] = util.strtotime(time[0]);
          time[1] = util.strtotime(time[1]);
          diff = Math.abs(time[1].getTime() - time[0].getTime());
          days = Math.ceil(diff / (1000 * 3600 * 24));
          item.timespan = days;
        }
      }
      spans = _.pluck(data, 'timespan');
      max = _.max(spans);
      last = data.length - 1;
      prev = {
        r: null,
        x: null,
        y: null
      };
      return _.each(data, function(item, n) {
        var circle, className, r, x, y;
        className = "color" + (n % 5);
        r = size.width * item.timespan / (2 * max * Math.PI);
        r += max / (5 * r);
        if (prev.x) {
          y = (size.height - height) / 2 - .3 * r + _.random(0, 100);
          x = prev.x + Math.sqrt(Math.abs((y - prev.y) * (y - prev.y) - (r + prev.r) * (r + prev.r)));
        } else {
          x = 20 + r;
          y = size.height - r - 20;
        }
        circle = paper.circle(0, 0, r);
        circle.mouseover(function() {
          return _this.over(circle);
        });
        circle.mouseout(function() {
          return _this.out(circle);
        });
        circle.click(function() {
          return _this.click(circle);
        });
        circle.node.setAttribute('class', className);
        circle.node.setAttribute('data-id', n);
        circle.attr({
          opacity: .5,
          stroke: '#fff',
          'stroke-width': 0
        });
        circle.animate({
          cx: x,
          cy: y
        }, 2000, 'elastic', function() {
          if (n === last) {
            return _this.model.set('throbber', new Throbber(circle, {
              click: _this.click,
              over: _this.over,
              out: _this.out
            }));
          }
        });
        _this.model.set("bubbles/" + n, {
          active: false,
          raphael: circle
        });
        return prev = {
          circle: circle,
          r: r,
          x: x,
          y: y
        };
      });
    };

    BubbleGraph.prototype.deactivate = function() {
      var active, bubble, pane,
        _this = this;
      pane = document.querySelector('.detail.active');
      active = _.where(this.model.get('bubbles'), {
        active: true
      });
      if (active[0]) {
        bubble = active[0].raphael;
        setTimeout(function() {
          u.classList.remove(bubble.node, active);
          return bubble.animate(_this.animations.inactive).transform('s1');
        }, 10);
        active[0].active = false;
      }
      if (pane) {
        u.classList.remove(pane, 'active');
        setTimeout(function() {
          return u.classList.add(pane, 'hide');
        }, .2);
        u.classList.add(document.querySelector('#details'), 'hide');
        return (document.querySelector('svg')).setAttribute('class', '');
      }
    };

    BubbleGraph.prototype.activate = function(bubble) {
      var id, panel;
      id = bubble.node.getAttribute('data-id');
      u.classList.add(bubble.node, 'active');
      u.classList.remove(document.querySelector('#details'), 'hide');
      panel = (document.querySelectorAll('.detail'))[id];
      u.classList.remove(panel, 'hide');
      u.classList.add(panel, 'active');
      bubble.toFront().animate(this.animations.active).transform('s1.1');
      (document.querySelector('svg')).setAttribute('class', 'small');
      return this.model.set("bubbles/" + id + "/active", true);
    };

    BubbleGraph.prototype.toggle = function(bubble) {
      var active;
      active = _.where(this.model.get('bubbles'), {
        active: true
      });
      this.deactivate();
      if (!active[0] || active[0].raphael !== bubble) {
        return this.activate(bubble);
      }
    };

    BubbleGraph.prototype.click = function(bubble) {
      var throbber;
      if (throbber = this.model.get('throbber')) {
        throbber.clear();
        this.model.set('throbber', null);
      }
      return this.toggle(bubble);
    };

    BubbleGraph.prototype.over = function(bubble) {
      var active;
      active = _.where(this.model.get('bubbles'), {
        active: true
      });
      if (!active[0] || bubble !== active[0]) {
        return bubble.animate(this.animations.over);
      }
    };

    BubbleGraph.prototype.out = function(bubble) {
      var active;
      active = _.where(this.model.get('bubbles'), {
        active: true
      });
      if (!active[0] || bubble !== active[0]) {
        return bubble.animate(this.animations.out);
      }
    };

    return BubbleGraph;

  })();
});

(function(root, factory) {
    if(typeof exports === 'object') {
        module.exports = factory();
    }
    else if(typeof define === 'function' && define.amd) {
        define('GMaps', [], factory);
    }

    root.GMaps = factory();

}(this, function() {
/*!
 * GMaps.js v0.4.7
 * http://hpneo.github.com/gmaps/
 *
 * Copyright 2013, Gustavo Leon
 * Released under the MIT License.
 */

if (!(typeof window.google === 'object' && window.google.maps)) {
  throw 'Google Maps API is required. Please register the following JavaScript library http://maps.google.com/maps/api/js?sensor=true.'
}

var extend_object = function(obj, new_obj) {
  var name;

  if (obj === new_obj) {
    return obj;
  }

  for (name in new_obj) {
    obj[name] = new_obj[name];
  }

  return obj;
};

var replace_object = function(obj, replace) {
  var name;

  if (obj === replace) {
    return obj;
  }

  for (name in replace) {
    if (obj[name] != undefined) {
      obj[name] = replace[name];
    }
  }

  return obj;
};

var array_map = function(array, callback) {
  var original_callback_params = Array.prototype.slice.call(arguments, 2),
      array_return = [],
      array_length = array.length,
      i;

  if (Array.prototype.map && array.map === Array.prototype.map) {
    array_return = Array.prototype.map.call(array, function(item) {
      callback_params = original_callback_params;
      callback_params.splice(0, 0, item);

      return callback.apply(this, callback_params);
    });
  }
  else {
    for (i = 0; i < array_length; i++) {
      callback_params = original_callback_params;
      callback_params.splice(0, 0, array[i]);
      array_return.push(callback.apply(this, callback_params));
    }
  }

  return array_return;
};

var array_flat = function(array) {
  var new_array = [],
      i;

  for (i = 0; i < array.length; i++) {
    new_array = new_array.concat(array[i]);
  }

  return new_array;
};

var coordsToLatLngs = function(coords, useGeoJSON) {
  var first_coord = coords[0],
      second_coord = coords[1];

  if (useGeoJSON) {
    first_coord = coords[1];
    second_coord = coords[0];
  }

  return new google.maps.LatLng(first_coord, second_coord);
};

var arrayToLatLng = function(coords, useGeoJSON) {
  var i;

  for (i = 0; i < coords.length; i++) {
    if (coords[i].length > 0 && typeof(coords[i][0]) == "object") {
      coords[i] = arrayToLatLng(coords[i], useGeoJSON);
    }
    else {
      coords[i] = coordsToLatLngs(coords[i], useGeoJSON);
    }
  }

  return coords;
};

var getElementById = function(id, context) {
  var element,
  id = id.replace('#', '');

  if ('jQuery' in this && context) {
    element = $("#" + id, context)[0];
  } else {
    element = document.getElementById(id);
  };

  return element;
};

var findAbsolutePosition = function(obj)  {
  var curleft = 0,
      curtop = 0;

  if (obj.offsetParent) {
    do {
      curleft += obj.offsetLeft;
      curtop += obj.offsetTop;
    } while (obj = obj.offsetParent);
  }

  return [curleft, curtop];
};

var GMaps = (function(global) {
  

  var doc = document;

  var GMaps = function(options) {
    if (!this) return new GMaps(options);

    options.zoom = options.zoom || 15;
    options.mapType = options.mapType || 'roadmap';

    var self = this,
        i,
        events_that_hide_context_menu = ['bounds_changed', 'center_changed', 'click', 'dblclick', 'drag', 'dragend', 'dragstart', 'idle', 'maptypeid_changed', 'projection_changed', 'resize', 'tilesloaded', 'zoom_changed'],
        events_that_doesnt_hide_context_menu = ['mousemove', 'mouseout', 'mouseover'],
        options_to_be_deleted = ['el', 'lat', 'lng', 'mapType', 'width', 'height', 'markerClusterer', 'enableNewStyle'],
        container_id = options.el || options.div,
        markerClustererFunction = options.markerClusterer,
        mapType = google.maps.MapTypeId[options.mapType.toUpperCase()],
        map_center = new google.maps.LatLng(options.lat, options.lng),
        zoomControl = options.zoomControl || true,
        zoomControlOpt = options.zoomControlOpt || {
          style: 'DEFAULT',
          position: 'TOP_LEFT'
        },
        zoomControlStyle = zoomControlOpt.style || 'DEFAULT',
        zoomControlPosition = zoomControlOpt.position || 'TOP_LEFT',
        panControl = options.panControl || true,
        mapTypeControl = options.mapTypeControl || true,
        scaleControl = options.scaleControl || true,
        streetViewControl = options.streetViewControl || true,
        overviewMapControl = overviewMapControl || true,
        map_options = {},
        map_base_options = {
          zoom: this.zoom,
          center: map_center,
          mapTypeId: mapType
        },
        map_controls_options = {
          panControl: panControl,
          zoomControl: zoomControl,
          zoomControlOptions: {
            style: google.maps.ZoomControlStyle[zoomControlStyle],
            position: google.maps.ControlPosition[zoomControlPosition]
          },
          mapTypeControl: mapTypeControl,
          scaleControl: scaleControl,
          streetViewControl: streetViewControl,
          overviewMapControl: overviewMapControl
        };

    if (typeof(options.el) === 'string' || typeof(options.div) === 'string') {
      this.el = getElementById(container_id, options.context);
    } else {
      this.el = container_id;
    }

    if (typeof(this.el) === 'undefined' || this.el === null) {
      throw 'No element defined.';
    }

    window.context_menu = window.context_menu || {};
    window.context_menu[self.el.id] = {};

    this.controls = [];
    this.overlays = [];
    this.layers = []; // array with kml/georss and fusiontables layers, can be as many
    this.singleLayers = {}; // object with the other layers, only one per layer
    this.markers = [];
    this.polylines = [];
    this.routes = [];
    this.polygons = [];
    this.infoWindow = null;
    this.overlay_el = null;
    this.zoom = options.zoom;
    this.registered_events = {};

    this.el.style.width = options.width || this.el.scrollWidth || this.el.offsetWidth;
    this.el.style.height = options.height || this.el.scrollHeight || this.el.offsetHeight;

    google.maps.visualRefresh = options.enableNewStyle;

    for (i = 0; i < options_to_be_deleted.length; i++) {
      delete options[options_to_be_deleted[i]];
    }

    if(options.disableDefaultUI != true) {
      map_base_options = extend_object(map_base_options, map_controls_options);
    }

    map_options = extend_object(map_base_options, options);

    for (i = 0; i < events_that_hide_context_menu.length; i++) {
      delete map_options[events_that_hide_context_menu[i]];
    }

    for (i = 0; i < events_that_doesnt_hide_context_menu.length; i++) {
      delete map_options[events_that_doesnt_hide_context_menu[i]];
    }

    this.map = new google.maps.Map(this.el, map_options);

    if (markerClustererFunction) {
      this.markerClusterer = markerClustererFunction.apply(this, [this.map]);
    }

    var buildContextMenuHTML = function(control, e) {
      var html = '',
          options = window.context_menu[self.el.id][control];

      for (var i in options){
        if (options.hasOwnProperty(i)) {
          var option = options[i];

          html += '<li><a id="' + control + '_' + i + '" href="#">' + option.title + '</a></li>';
        }
      }

      if (!getElementById('gmaps_context_menu')) return;

      var context_menu_element = getElementById('gmaps_context_menu');
      
      context_menu_element.innerHTML = html;

      var context_menu_items = context_menu_element.getElementsByTagName('a'),
          context_menu_items_count = context_menu_items.length
          i;

      for (i = 0; i < context_menu_items_count; i++) {
        var context_menu_item = context_menu_items[i];

        var assign_menu_item_action = function(ev){
          ev.preventDefault();

          options[this.id.replace(control + '_', '')].action.apply(self, [e]);
          self.hideContextMenu();
        };

        google.maps.event.clearListeners(context_menu_item, 'click');
        google.maps.event.addDomListenerOnce(context_menu_item, 'click', assign_menu_item_action, false);
      }

      var position = findAbsolutePosition.apply(this, [self.el]),
          left = position[0] + e.pixel.x - 15,
          top = position[1] + e.pixel.y- 15;

      context_menu_element.style.left = left + "px";
      context_menu_element.style.top = top + "px";

      context_menu_element.style.display = 'block';
    };

    this.buildContextMenu = function(control, e) {
      if (control === 'marker') {
        e.pixel = {};

        var overlay = new google.maps.OverlayView();
        overlay.setMap(self.map);
        
        overlay.draw = function() {
          var projection = overlay.getProjection(),
              position = e.marker.getPosition();
          
          e.pixel = projection.fromLatLngToContainerPixel(position);

          buildContextMenuHTML(control, e);
        };
      }
      else {
        buildContextMenuHTML(control, e);
      }
    };

    this.setContextMenu = function(options) {
      window.context_menu[self.el.id][options.control] = {};

      var i,
          ul = doc.createElement('ul');

      for (i in options.options) {
        if (options.options.hasOwnProperty(i)) {
          var option = options.options[i];

          window.context_menu[self.el.id][options.control][option.name] = {
            title: option.title,
            action: option.action
          };
        }
      }

      ul.id = 'gmaps_context_menu';
      ul.style.display = 'none';
      ul.style.position = 'absolute';
      ul.style.minWidth = '100px';
      ul.style.background = 'white';
      ul.style.listStyle = 'none';
      ul.style.padding = '8px';
      ul.style.boxShadow = '2px 2px 6px #ccc';

      doc.body.appendChild(ul);

      var context_menu_element = getElementById('gmaps_context_menu')

      google.maps.event.addDomListener(context_menu_element, 'mouseout', function(ev) {
        if (!ev.relatedTarget || !this.contains(ev.relatedTarget)) {
          window.setTimeout(function(){
            context_menu_element.style.display = 'none';
          }, 400);
        }
      }, false);
    };

    this.hideContextMenu = function() {
      var context_menu_element = getElementById('gmaps_context_menu');

      if (context_menu_element) {
        context_menu_element.style.display = 'none';
      }
    };

    var setupListener = function(object, name) {
      google.maps.event.addListener(object, name, function(e){
        if (e == undefined) {
          e = this;
        }

        options[name].apply(this, [e]);

        self.hideContextMenu();
      });
    };

    for (var ev = 0; ev < events_that_hide_context_menu.length; ev++) {
      var name = events_that_hide_context_menu[ev];

      if (name in options) {
        setupListener(this.map, name);
      }
    }

    for (var ev = 0; ev < events_that_doesnt_hide_context_menu.length; ev++) {
      var name = events_that_doesnt_hide_context_menu[ev];

      if (name in options) {
        setupListener(this.map, name);
      }
    }

    google.maps.event.addListener(this.map, 'rightclick', function(e) {
      if (options.rightclick) {
        options.rightclick.apply(this, [e]);
      }

      if(window.context_menu[self.el.id]['map'] != undefined) {
        self.buildContextMenu('map', e);
      }
    });

    this.refresh = function() {
      google.maps.event.trigger(this.map, 'resize');
    };

    this.fitZoom = function() {
      var latLngs = [],
          markers_length = this.markers.length,
          i;

      for (i = 0; i < markers_length; i++) {
        latLngs.push(this.markers[i].getPosition());
      }

      this.fitLatLngBounds(latLngs);
    };

    this.fitLatLngBounds = function(latLngs) {
      var total = latLngs.length;
      var bounds = new google.maps.LatLngBounds();

      for(var i=0; i < total; i++) {
        bounds.extend(latLngs[i]);
      }

      this.map.fitBounds(bounds);
    };

    this.setCenter = function(lat, lng, callback) {
      this.map.panTo(new google.maps.LatLng(lat, lng));

      if (callback) {
        callback();
      }
    };

    this.getElement = function() {
      return this.el;
    };

    this.zoomIn = function(value) {
      value = value || 1;

      this.zoom = this.map.getZoom() + value;
      this.map.setZoom(this.zoom);
    };

    this.zoomOut = function(value) {
      value = value || 1;

      this.zoom = this.map.getZoom() - value;
      this.map.setZoom(this.zoom);
    };

    var native_methods = [],
        method;

    for (method in this.map) {
      if (typeof(this.map[method]) == 'function' && !this[method]) {
        native_methods.push(method);
      }
    }

    for (i=0; i < native_methods.length; i++) {
      (function(gmaps, scope, method_name) {
        gmaps[method_name] = function(){
          return scope[method_name].apply(scope, arguments);
        };
      })(this, this.map, native_methods[i]);
    }
  };

  return GMaps;
})(this);

GMaps.prototype.createControl = function(options) {
  var control = document.createElement('div');

  control.style.cursor = 'pointer';
  control.style.fontFamily = 'Arial, sans-serif';
  control.style.fontSize = '13px';
  control.style.boxShadow = 'rgba(0, 0, 0, 0.398438) 0px 2px 4px';

  for (var option in options.style) {
    control.style[option] = options.style[option];
  }

  if (options.id) {
    control.id = options.id;
  }

  if (options.classes) {
    control.className = options.classes;
  }

  if (options.content) {
    control.innerHTML = options.content;
  }

  for (var ev in options.events) {
    (function(object, name) {
      google.maps.event.addDomListener(object, name, function(){
        options.events[name].apply(this, [this]);
      });
    })(control, ev);
  }

  control.index = 1;

  return control;
};

GMaps.prototype.addControl = function(options) {
  var position = google.maps.ControlPosition[options.position.toUpperCase()];

  delete options.position;

  var control = this.createControl(options);
  this.controls.push(control);
  
  this.map.controls[position].push(control);

  return control;
};

GMaps.prototype.createMarker = function(options) {
  if (options.lat == undefined && options.lng == undefined && options.position == undefined) {
    throw 'No latitude or longitude defined.';
  }

  var self = this,
      details = options.details,
      fences = options.fences,
      outside = options.outside,
      base_options = {
        position: new google.maps.LatLng(options.lat, options.lng),
        map: null
      };

  delete options.lat;
  delete options.lng;
  delete options.fences;
  delete options.outside;

  var marker_options = extend_object(base_options, options),
      marker = new google.maps.Marker(marker_options);

  marker.fences = fences;

  if (options.infoWindow) {
    marker.infoWindow = new google.maps.InfoWindow(options.infoWindow);

    var info_window_events = ['closeclick', 'content_changed', 'domready', 'position_changed', 'zindex_changed'];

    for (var ev = 0; ev < info_window_events.length; ev++) {
      (function(object, name) {
        if (options.infoWindow[name]) {
          google.maps.event.addListener(object, name, function(e){
            options.infoWindow[name].apply(this, [e]);
          });
        }
      })(marker.infoWindow, info_window_events[ev]);
    }
  }

  var marker_events = ['animation_changed', 'clickable_changed', 'cursor_changed', 'draggable_changed', 'flat_changed', 'icon_changed', 'position_changed', 'shadow_changed', 'shape_changed', 'title_changed', 'visible_changed', 'zindex_changed'];

  var marker_events_with_mouse = ['dblclick', 'drag', 'dragend', 'dragstart', 'mousedown', 'mouseout', 'mouseover', 'mouseup'];

  for (var ev = 0; ev < marker_events.length; ev++) {
    (function(object, name) {
      if (options[name]) {
        google.maps.event.addListener(object, name, function(){
          options[name].apply(this, [this]);
        });
      }
    })(marker, marker_events[ev]);
  }

  for (var ev = 0; ev < marker_events_with_mouse.length; ev++) {
    (function(map, object, name) {
      if (options[name]) {
        google.maps.event.addListener(object, name, function(me){
          if(!me.pixel){
            me.pixel = map.getProjection().fromLatLngToPoint(me.latLng)
          }
          
          options[name].apply(this, [me]);
        });
      }
    })(this.map, marker, marker_events_with_mouse[ev]);
  }

  google.maps.event.addListener(marker, 'click', function() {
    this.details = details;

    if (options.click) {
      options.click.apply(this, [this]);
    }

    if (marker.infoWindow) {
      self.hideInfoWindows();
      marker.infoWindow.open(self.map, marker);
    }
  });

  google.maps.event.addListener(marker, 'rightclick', function(e) {
    e.marker = this;

    if (options.rightclick) {
      options.rightclick.apply(this, [e]);
    }

    if (window.context_menu[self.el.id]['marker'] != undefined) {
      self.buildContextMenu('marker', e);
    }
  });

  if (marker.fences) {
    google.maps.event.addListener(marker, 'dragend', function() {
      self.checkMarkerGeofence(marker, function(m, f) {
        outside(m, f);
      });
    });
  }

  return marker;
};

GMaps.prototype.addMarker = function(options) {
  var marker;
  if(options.hasOwnProperty('gm_accessors_')) {
    // Native google.maps.Marker object
    marker = options;
  }
  else {
    if ((options.hasOwnProperty('lat') && options.hasOwnProperty('lng')) || options.position) {
      marker = this.createMarker(options);
    }
    else {
      throw 'No latitude or longitude defined.';
    }
  }

  marker.setMap(this.map);

  if(this.markerClusterer) {
    this.markerClusterer.addMarker(marker);
  }

  this.markers.push(marker);

  GMaps.fire('marker_added', marker, this);

  return marker;
};

GMaps.prototype.addMarkers = function(array) {
  for (var i = 0, marker; marker=array[i]; i++) {
    this.addMarker(marker);
  }

  return this.markers;
};

GMaps.prototype.hideInfoWindows = function() {
  for (var i = 0, marker; marker = this.markers[i]; i++){
    if (marker.infoWindow){
      marker.infoWindow.close();
    }
  }
};

GMaps.prototype.removeMarker = function(marker) {
  for (var i = 0; i < this.markers.length; i++) {
    if (this.markers[i] === marker) {
      this.markers[i].setMap(null);
      this.markers.splice(i, 1);

      if(this.markerClusterer) {
        this.markerClusterer.removeMarker(marker);
      }

      GMaps.fire('marker_removed', marker, this);

      break;
    }
  }

  return marker;
};

GMaps.prototype.removeMarkers = function(collection) {
  var collection = (collection || this.markers);

  for (var i = 0;i < this.markers.length; i++) {
    if(this.markers[i] === collection[i]) {
      this.markers[i].setMap(null);
    }
  }

  var new_markers = [];

  for (var i = 0;i < this.markers.length; i++) {
    if(this.markers[i].getMap() != null) {
      new_markers.push(this.markers[i]);
    }
  }

  this.markers = new_markers;
};

GMaps.prototype.drawOverlay = function(options) {
  var overlay = new google.maps.OverlayView(),
      auto_show = true;

  overlay.setMap(this.map);

  if (options.auto_show != null) {
    auto_show = options.auto_show;
  }

  overlay.onAdd = function() {
    var el = document.createElement('div');

    el.style.borderStyle = "none";
    el.style.borderWidth = "0px";
    el.style.position = "absolute";
    el.style.zIndex = 100;
    el.innerHTML = options.content;

    overlay.el = el;

    if (!options.layer) {
      options.layer = 'overlayLayer';
    }
    
    var panes = this.getPanes(),
        overlayLayer = panes[options.layer],
        stop_overlay_events = ['contextmenu', 'DOMMouseScroll', 'dblclick', 'mousedown'];

    overlayLayer.appendChild(el);

    for (var ev = 0; ev < stop_overlay_events.length; ev++) {
      (function(object, name) {
        google.maps.event.addDomListener(object, name, function(e){
          if (navigator.userAgent.toLowerCase().indexOf('msie') != -1 && document.all) {
            e.cancelBubble = true;
            e.returnValue = false;
          }
          else {
            e.stopPropagation();
          }
        });
      })(el, stop_overlay_events[ev]);
    }

    google.maps.event.trigger(this, 'ready');
  };

  overlay.draw = function() {
    var projection = this.getProjection(),
        pixel = projection.fromLatLngToDivPixel(new google.maps.LatLng(options.lat, options.lng));

    options.horizontalOffset = options.horizontalOffset || 0;
    options.verticalOffset = options.verticalOffset || 0;

    var el = overlay.el,
        content = el.children[0],
        content_height = content.clientHeight,
        content_width = content.clientWidth;

    switch (options.verticalAlign) {
      case 'top':
        el.style.top = (pixel.y - content_height + options.verticalOffset) + 'px';
        break;
      default:
      case 'middle':
        el.style.top = (pixel.y - (content_height / 2) + options.verticalOffset) + 'px';
        break;
      case 'bottom':
        el.style.top = (pixel.y + options.verticalOffset) + 'px';
        break;
    }

    switch (options.horizontalAlign) {
      case 'left':
        el.style.left = (pixel.x - content_width + options.horizontalOffset) + 'px';
        break;
      default:
      case 'center':
        el.style.left = (pixel.x - (content_width / 2) + options.horizontalOffset) + 'px';
        break;
      case 'right':
        el.style.left = (pixel.x + options.horizontalOffset) + 'px';
        break;
    }

    el.style.display = auto_show ? 'block' : 'none';

    if (!auto_show) {
      options.show.apply(this, [el]);
    }
  };

  overlay.onRemove = function() {
    var el = overlay.el;

    if (options.remove) {
      options.remove.apply(this, [el]);
    }
    else {
      overlay.el.parentNode.removeChild(overlay.el);
      overlay.el = null;
    }
  };

  this.overlays.push(overlay);
  return overlay;
};

GMaps.prototype.removeOverlay = function(overlay) {
  for (var i = 0; i < this.overlays.length; i++) {
    if (this.overlays[i] === overlay) {
      this.overlays[i].setMap(null);
      this.overlays.splice(i, 1);

      break;
    }
  }
};

GMaps.prototype.removeOverlays = function() {
  for (var i = 0, item; item = this.overlays[i]; i++) {
    item.setMap(null);
  }

  this.overlays = [];
};

GMaps.prototype.drawPolyline = function(options) {
  var path = [],
      points = options.path;

  if (points.length) {
    if (points[0][0] === undefined) {
      path = points;
    }
    else {
      for (var i=0, latlng; latlng=points[i]; i++) {
        path.push(new google.maps.LatLng(latlng[0], latlng[1]));
      }
    }
  }

  var polyline_options = {
    map: this.map,
    path: path,
    strokeColor: options.strokeColor,
    strokeOpacity: options.strokeOpacity,
    strokeWeight: options.strokeWeight,
    geodesic: options.geodesic,
    clickable: true,
    editable: false,
    visible: true
  };

  if (options.hasOwnProperty("clickable")) {
    polyline_options.clickable = options.clickable;
  }

  if (options.hasOwnProperty("editable")) {
    polyline_options.editable = options.editable;
  }

  if (options.hasOwnProperty("icons")) {
    polyline_options.icons = options.icons;
  }

  if (options.hasOwnProperty("zIndex")) {
    polyline_options.zIndex = options.zIndex;
  }

  var polyline = new google.maps.Polyline(polyline_options);

  var polyline_events = ['click', 'dblclick', 'mousedown', 'mousemove', 'mouseout', 'mouseover', 'mouseup', 'rightclick'];

  for (var ev = 0; ev < polyline_events.length; ev++) {
    (function(object, name) {
      if (options[name]) {
        google.maps.event.addListener(object, name, function(e){
          options[name].apply(this, [e]);
        });
      }
    })(polyline, polyline_events[ev]);
  }

  this.polylines.push(polyline);

  GMaps.fire('polyline_added', polyline, this);

  return polyline;
};

GMaps.prototype.removePolyline = function(polyline) {
  for (var i = 0; i < this.polylines.length; i++) {
    if (this.polylines[i] === polyline) {
      this.polylines[i].setMap(null);
      this.polylines.splice(i, 1);

      GMaps.fire('polyline_removed', polyline, this);

      break;
    }
  }
};

GMaps.prototype.removePolylines = function() {
  for (var i = 0, item; item = this.polylines[i]; i++) {
    item.setMap(null);
  }

  this.polylines = [];
};

GMaps.prototype.drawCircle = function(options) {
  options =  extend_object({
    map: this.map,
    center: new google.maps.LatLng(options.lat, options.lng)
  }, options);

  delete options.lat;
  delete options.lng;

  var polygon = new google.maps.Circle(options),
      polygon_events = ['click', 'dblclick', 'mousedown', 'mousemove', 'mouseout', 'mouseover', 'mouseup', 'rightclick'];

  for (var ev = 0; ev < polygon_events.length; ev++) {
    (function(object, name) {
      if (options[name]) {
        google.maps.event.addListener(object, name, function(e){
          options[name].apply(this, [e]);
        });
      }
    })(polygon, polygon_events[ev]);
  }

  this.polygons.push(polygon);

  return polygon;
};

GMaps.prototype.drawRectangle = function(options) {
  options = extend_object({
    map: this.map
  }, options);

  var latLngBounds = new google.maps.LatLngBounds(
    new google.maps.LatLng(options.bounds[0][0], options.bounds[0][1]),
    new google.maps.LatLng(options.bounds[1][0], options.bounds[1][1])
  );

  options.bounds = latLngBounds;

  var polygon = new google.maps.Rectangle(options),
      polygon_events = ['click', 'dblclick', 'mousedown', 'mousemove', 'mouseout', 'mouseover', 'mouseup', 'rightclick'];

  for (var ev = 0; ev < polygon_events.length; ev++) {
    (function(object, name) {
      if (options[name]) {
        google.maps.event.addListener(object, name, function(e){
          options[name].apply(this, [e]);
        });
      }
    })(polygon, polygon_events[ev]);
  }

  this.polygons.push(polygon);

  return polygon;
};

GMaps.prototype.drawPolygon = function(options) {
  var useGeoJSON = false;

  if(options.hasOwnProperty("useGeoJSON")) {
    useGeoJSON = options.useGeoJSON;
  }

  delete options.useGeoJSON;

  options = extend_object({
    map: this.map
  }, options);

  if (useGeoJSON == false) {
    options.paths = [options.paths.slice(0)];
  }

  if (options.paths.length > 0) {
    if (options.paths[0].length > 0) {
      options.paths = array_flat(array_map(options.paths, arrayToLatLng, useGeoJSON));
    }
  }

  var polygon = new google.maps.Polygon(options),
      polygon_events = ['click', 'dblclick', 'mousedown', 'mousemove', 'mouseout', 'mouseover', 'mouseup', 'rightclick'];

  for (var ev = 0; ev < polygon_events.length; ev++) {
    (function(object, name) {
      if (options[name]) {
        google.maps.event.addListener(object, name, function(e){
          options[name].apply(this, [e]);
        });
      }
    })(polygon, polygon_events[ev]);
  }

  this.polygons.push(polygon);

  GMaps.fire('polygon_added', polygon, this);

  return polygon;
};

GMaps.prototype.removePolygon = function(polygon) {
  for (var i = 0; i < this.polygons.length; i++) {
    if (this.polygons[i] === polygon) {
      this.polygons[i].setMap(null);
      this.polygons.splice(i, 1);

      GMaps.fire('polygon_removed', polygon, this);

      break;
    }
  }
};

GMaps.prototype.removePolygons = function() {
  for (var i = 0, item; item = this.polygons[i]; i++) {
    item.setMap(null);
  }

  this.polygons = [];
};

GMaps.prototype.getFromFusionTables = function(options) {
  var events = options.events;

  delete options.events;

  var fusion_tables_options = options,
      layer = new google.maps.FusionTablesLayer(fusion_tables_options);

  for (var ev in events) {
    (function(object, name) {
      google.maps.event.addListener(object, name, function(e) {
        events[name].apply(this, [e]);
      });
    })(layer, ev);
  }

  this.layers.push(layer);

  return layer;
};

GMaps.prototype.loadFromFusionTables = function(options) {
  var layer = this.getFromFusionTables(options);
  layer.setMap(this.map);

  return layer;
};

GMaps.prototype.getFromKML = function(options) {
  var url = options.url,
      events = options.events;

  delete options.url;
  delete options.events;

  var kml_options = options,
      layer = new google.maps.KmlLayer(url, kml_options);

  for (var ev in events) {
    (function(object, name) {
      google.maps.event.addListener(object, name, function(e) {
        events[name].apply(this, [e]);
      });
    })(layer, ev);
  }

  this.layers.push(layer);

  return layer;
};

GMaps.prototype.loadFromKML = function(options) {
  var layer = this.getFromKML(options);
  layer.setMap(this.map);

  return layer;
};

GMaps.prototype.addLayer = function(layerName, options) {
  //var default_layers = ['weather', 'clouds', 'traffic', 'transit', 'bicycling', 'panoramio', 'places'];
  options = options || {};
  var layer;

  switch(layerName) {
    case 'weather': this.singleLayers.weather = layer = new google.maps.weather.WeatherLayer();
      break;
    case 'clouds': this.singleLayers.clouds = layer = new google.maps.weather.CloudLayer();
      break;
    case 'traffic': this.singleLayers.traffic = layer = new google.maps.TrafficLayer();
      break;
    case 'transit': this.singleLayers.transit = layer = new google.maps.TransitLayer();
      break;
    case 'bicycling': this.singleLayers.bicycling = layer = new google.maps.BicyclingLayer();
      break;
    case 'panoramio':
        this.singleLayers.panoramio = layer = new google.maps.panoramio.PanoramioLayer();
        layer.setTag(options.filter);
        delete options.filter;

        //click event
        if (options.click) {
          google.maps.event.addListener(layer, 'click', function(event) {
            options.click(event);
            delete options.click;
          });
        }
      break;
      case 'places':
        this.singleLayers.places = layer = new google.maps.places.PlacesService(this.map);

        //search and  nearbySearch callback, Both are the same
        if (options.search || options.nearbySearch) {
          var placeSearchRequest  = {
            bounds : options.bounds || null,
            keyword : options.keyword || null,
            location : options.location || null,
            name : options.name || null,
            radius : options.radius || null,
            rankBy : options.rankBy || null,
            types : options.types || null
          };

          if (options.search) {
            layer.search(placeSearchRequest, options.search);
          }

          if (options.nearbySearch) {
            layer.nearbySearch(placeSearchRequest, options.nearbySearch);
          }
        }

        //textSearch callback
        if (options.textSearch) {
          var textSearchRequest  = {
            bounds : options.bounds || null,
            location : options.location || null,
            query : options.query || null,
            radius : options.radius || null
          };

          layer.textSearch(textSearchRequest, options.textSearch);
        }
      break;
  }

  if (layer !== undefined) {
    if (typeof layer.setOptions == 'function') {
      layer.setOptions(options);
    }
    if (typeof layer.setMap == 'function') {
      layer.setMap(this.map);
    }

    return layer;
  }
};

GMaps.prototype.removeLayer = function(layer) {
  if (typeof(layer) == "string" && this.singleLayers[layer] !== undefined) {
     this.singleLayers[layer].setMap(null);

     delete this.singleLayers[layer];
  }
  else {
    for (var i = 0; i < this.layers.length; i++) {
      if (this.layers[i] === layer) {
        this.layers[i].setMap(null);
        this.layers.splice(i, 1);

        break;
      }
    }
  }
};

var travelMode, unitSystem;

GMaps.prototype.getRoutes = function(options) {
  switch (options.travelMode) {
    case 'bicycling':
      travelMode = google.maps.TravelMode.BICYCLING;
      break;
    case 'transit':
      travelMode = google.maps.TravelMode.TRANSIT;
      break;
    case 'driving':
      travelMode = google.maps.TravelMode.DRIVING;
      break;
    default:
      travelMode = google.maps.TravelMode.WALKING;
      break;
  }

  if (options.unitSystem === 'imperial') {
    unitSystem = google.maps.UnitSystem.IMPERIAL;
  }
  else {
    unitSystem = google.maps.UnitSystem.METRIC;
  }

  var base_options = {
        avoidHighways: false,
        avoidTolls: false,
        optimizeWaypoints: false,
        waypoints: []
      },
      request_options =  extend_object(base_options, options);

  request_options.origin = /string/.test(typeof options.origin) ? options.origin : new google.maps.LatLng(options.origin[0], options.origin[1]);
  request_options.destination = /string/.test(typeof options.destination) ? options.destination : new google.maps.LatLng(options.destination[0], options.destination[1]);
  request_options.travelMode = travelMode;
  request_options.unitSystem = unitSystem;

  delete request_options.callback;

  var self = this,
      service = new google.maps.DirectionsService();

  service.route(request_options, function(result, status) {
    if (status === google.maps.DirectionsStatus.OK) {
      for (var r in result.routes) {
        if (result.routes.hasOwnProperty(r)) {
          self.routes.push(result.routes[r]);
        }
      }

      if (options.callback) {
        options.callback(self.routes);
      }
    }
    else {
      if (options.error) {
        options.error(result, status);
      }
    }
  });
};

GMaps.prototype.removeRoutes = function() {
  this.routes = [];
};

GMaps.prototype.getElevations = function(options) {
  options = extend_object({
    locations: [],
    path : false,
    samples : 256
  }, options);

  if (options.locations.length > 0) {
    if (options.locations[0].length > 0) {
      options.locations = array_flat(array_map([options.locations], arrayToLatLng,  false));
    }
  }

  var callback = options.callback;
  delete options.callback;

  var service = new google.maps.ElevationService();

  //location request
  if (!options.path) {
    delete options.path;
    delete options.samples;

    service.getElevationForLocations(options, function(result, status) {
      if (callback && typeof(callback) === "function") {
        callback(result, status);
      }
    });
  //path request
  } else {
    var pathRequest = {
      path : options.locations,
      samples : options.samples
    };

    service.getElevationAlongPath(pathRequest, function(result, status) {
     if (callback && typeof(callback) === "function") {
        callback(result, status);
      }
    });
  }
};

GMaps.prototype.cleanRoute = GMaps.prototype.removePolylines;

GMaps.prototype.drawRoute = function(options) {
  var self = this;

  this.getRoutes({
    origin: options.origin,
    destination: options.destination,
    travelMode: options.travelMode,
    waypoints: options.waypoints,
    unitSystem: options.unitSystem,
    error: options.error,
    callback: function(e) {
      if (e.length > 0) {
        self.drawPolyline({
          path: e[e.length - 1].overview_path,
          strokeColor: options.strokeColor,
          strokeOpacity: options.strokeOpacity,
          strokeWeight: options.strokeWeight
        });
        
        if (options.callback) {
          options.callback(e[e.length - 1]);
        }
      }
    }
  });
};

GMaps.prototype.travelRoute = function(options) {
  if (options.origin && options.destination) {
    this.getRoutes({
      origin: options.origin,
      destination: options.destination,
      travelMode: options.travelMode,
      waypoints : options.waypoints,
      error: options.error,
      callback: function(e) {
        //start callback
        if (e.length > 0 && options.start) {
          options.start(e[e.length - 1]);
        }

        //step callback
        if (e.length > 0 && options.step) {
          var route = e[e.length - 1];
          if (route.legs.length > 0) {
            var steps = route.legs[0].steps;
            for (var i=0, step; step=steps[i]; i++) {
              step.step_number = i;
              options.step(step, (route.legs[0].steps.length - 1));
            }
          }
        }

        //end callback
        if (e.length > 0 && options.end) {
           options.end(e[e.length - 1]);
        }
      }
    });
  }
  else if (options.route) {
    if (options.route.legs.length > 0) {
      var steps = options.route.legs[0].steps;
      for (var i=0, step; step=steps[i]; i++) {
        step.step_number = i;
        options.step(step);
      }
    }
  }
};

GMaps.prototype.drawSteppedRoute = function(options) {
  var self = this;
  
  if (options.origin && options.destination) {
    this.getRoutes({
      origin: options.origin,
      destination: options.destination,
      travelMode: options.travelMode,
      waypoints : options.waypoints,
      error: options.error,
      callback: function(e) {
        //start callback
        if (e.length > 0 && options.start) {
          options.start(e[e.length - 1]);
        }

        //step callback
        if (e.length > 0 && options.step) {
          var route = e[e.length - 1];
          if (route.legs.length > 0) {
            var steps = route.legs[0].steps;
            for (var i=0, step; step=steps[i]; i++) {
              step.step_number = i;
              self.drawPolyline({
                path: step.path,
                strokeColor: options.strokeColor,
                strokeOpacity: options.strokeOpacity,
                strokeWeight: options.strokeWeight
              });
              options.step(step, (route.legs[0].steps.length - 1));
            }
          }
        }

        //end callback
        if (e.length > 0 && options.end) {
           options.end(e[e.length - 1]);
        }
      }
    });
  }
  else if (options.route) {
    if (options.route.legs.length > 0) {
      var steps = options.route.legs[0].steps;
      for (var i=0, step; step=steps[i]; i++) {
        step.step_number = i;
        self.drawPolyline({
          path: step.path,
          strokeColor: options.strokeColor,
          strokeOpacity: options.strokeOpacity,
          strokeWeight: options.strokeWeight
        });
        options.step(step);
      }
    }
  }
};

GMaps.Route = function(options) {
  this.origin = options.origin;
  this.destination = options.destination;
  this.waypoints = options.waypoints;

  this.map = options.map;
  this.route = options.route;
  this.step_count = 0;
  this.steps = this.route.legs[0].steps;
  this.steps_length = this.steps.length;

  this.polyline = this.map.drawPolyline({
    path: new google.maps.MVCArray(),
    strokeColor: options.strokeColor,
    strokeOpacity: options.strokeOpacity,
    strokeWeight: options.strokeWeight
  }).getPath();
};

GMaps.Route.prototype.getRoute = function(options) {
  var self = this;

  this.map.getRoutes({
    origin : this.origin,
    destination : this.destination,
    travelMode : options.travelMode,
    waypoints : this.waypoints || [],
    error: options.error,
    callback : function() {
      self.route = e[0];

      if (options.callback) {
        options.callback.call(self);
      }
    }
  });
};

GMaps.Route.prototype.back = function() {
  if (this.step_count > 0) {
    this.step_count--;
    var path = this.route.legs[0].steps[this.step_count].path;

    for (var p in path){
      if (path.hasOwnProperty(p)){
        this.polyline.pop();
      }
    }
  }
};

GMaps.Route.prototype.forward = function() {
  if (this.step_count < this.steps_length) {
    var path = this.route.legs[0].steps[this.step_count].path;

    for (var p in path){
      if (path.hasOwnProperty(p)){
        this.polyline.push(path[p]);
      }
    }
    this.step_count++;
  }
};

GMaps.prototype.checkGeofence = function(lat, lng, fence) {
  return fence.containsLatLng(new google.maps.LatLng(lat, lng));
};

GMaps.prototype.checkMarkerGeofence = function(marker, outside_callback) {
  if (marker.fences) {
    for (var i = 0, fence; fence = marker.fences[i]; i++) {
      var pos = marker.getPosition();
      if (!this.checkGeofence(pos.lat(), pos.lng(), fence)) {
        outside_callback(marker, fence);
      }
    }
  }
};

GMaps.prototype.toImage = function(options) {
  var options = options || {},
      static_map_options = {};

  static_map_options['size'] = options['size'] || [this.el.clientWidth, this.el.clientHeight];
  static_map_options['lat'] = this.getCenter().lat();
  static_map_options['lng'] = this.getCenter().lng();

  if (this.markers.length > 0) {
    static_map_options['markers'] = [];
    
    for (var i = 0; i < this.markers.length; i++) {
      static_map_options['markers'].push({
        lat: this.markers[i].getPosition().lat(),
        lng: this.markers[i].getPosition().lng()
      });
    }
  }

  if (this.polylines.length > 0) {
    var polyline = this.polylines[0];
    
    static_map_options['polyline'] = {};
    static_map_options['polyline']['path'] = google.maps.geometry.encoding.encodePath(polyline.getPath());
    static_map_options['polyline']['strokeColor'] = polyline.strokeColor
    static_map_options['polyline']['strokeOpacity'] = polyline.strokeOpacity
    static_map_options['polyline']['strokeWeight'] = polyline.strokeWeight
  }

  return GMaps.staticMapURL(static_map_options);
};

GMaps.staticMapURL = function(options){
  var parameters = [],
      data,
      static_root = 'http://maps.googleapis.com/maps/api/staticmap';

  if (options.url) {
    static_root = options.url;
    delete options.url;
  }

  static_root += '?';

  var markers = options.markers;
  
  delete options.markers;

  if (!markers && options.marker) {
    markers = [options.marker];
    delete options.marker;
  }

  var styles = options.styles;

  delete options.styles;

  var polyline = options.polyline;
  delete options.polyline;

  /** Map options **/
  if (options.center) {
    parameters.push('center=' + options.center);
    delete options.center;
  }
  else if (options.address) {
    parameters.push('center=' + options.address);
    delete options.address;
  }
  else if (options.lat) {
    parameters.push(['center=', options.lat, ',', options.lng].join(''));
    delete options.lat;
    delete options.lng;
  }
  else if (options.visible) {
    var visible = encodeURI(options.visible.join('|'));
    parameters.push('visible=' + visible);
  }

  var size = options.size;
  if (size) {
    if (size.join) {
      size = size.join('x');
    }
    delete options.size;
  }
  else {
    size = '630x300';
  }
  parameters.push('size=' + size);

  if (!options.zoom && options.zoom !== false) {
    options.zoom = 15;
  }

  var sensor = options.hasOwnProperty('sensor') ? !!options.sensor : true;
  delete options.sensor;
  parameters.push('sensor=' + sensor);

  for (var param in options) {
    if (options.hasOwnProperty(param)) {
      parameters.push(param + '=' + options[param]);
    }
  }

  /** Markers **/
  if (markers) {
    var marker, loc;

    for (var i=0; data=markers[i]; i++) {
      marker = [];

      if (data.size && data.size !== 'normal') {
        marker.push('size:' + data.size);
        delete data.size;
      }
      else if (data.icon) {
        marker.push('icon:' + encodeURI(data.icon));
        delete data.icon;
      }

      if (data.color) {
        marker.push('color:' + data.color.replace('#', '0x'));
        delete data.color;
      }

      if (data.label) {
        marker.push('label:' + data.label[0].toUpperCase());
        delete data.label;
      }

      loc = (data.address ? data.address : data.lat + ',' + data.lng);
      delete data.address;
      delete data.lat;
      delete data.lng;

      for(var param in data){
        if (data.hasOwnProperty(param)) {
          marker.push(param + ':' + data[param]);
        }
      }

      if (marker.length || i === 0) {
        marker.push(loc);
        marker = marker.join('|');
        parameters.push('markers=' + encodeURI(marker));
      }
      // New marker without styles
      else {
        marker = parameters.pop() + encodeURI('|' + loc);
        parameters.push(marker);
      }
    }
  }

  /** Map Styles **/
  if (styles) {
    for (var i = 0; i < styles.length; i++) {
      var styleRule = [];
      if (styles[i].featureType && styles[i].featureType != 'all' ) {
        styleRule.push('feature:' + styles[i].featureType);
      }

      if (styles[i].elementType && styles[i].elementType != 'all') {
        styleRule.push('element:' + styles[i].elementType);
      }

      for (var j = 0; j < styles[i].stylers.length; j++) {
        for (var p in styles[i].stylers[j]) {
          var ruleArg = styles[i].stylers[j][p];
          if (p == 'hue' || p == 'color') {
            ruleArg = '0x' + ruleArg.substring(1);
          }
          styleRule.push(p + ':' + ruleArg);
        }
      }

      var rule = styleRule.join('|');
      if (rule != '') {
        parameters.push('style=' + rule);
      }
    }
  }

  /** Polylines **/
  function parseColor(color, opacity) {
    if (color[0] === '#'){
      color = color.replace('#', '0x');

      if (opacity) {
        opacity = parseFloat(opacity);
        opacity = Math.min(1, Math.max(opacity, 0));
        if (opacity === 0) {
          return '0x00000000';
        }
        opacity = (opacity * 255).toString(16);
        if (opacity.length === 1) {
          opacity += opacity;
        }

        color = color.slice(0,8) + opacity;
      }
    }
    return color;
  }

  if (polyline) {
    data = polyline;
    polyline = [];

    if (data.strokeWeight) {
      polyline.push('weight:' + parseInt(data.strokeWeight, 10));
    }

    if (data.strokeColor) {
      var color = parseColor(data.strokeColor, data.strokeOpacity);
      polyline.push('color:' + color);
    }

    if (data.fillColor) {
      var fillcolor = parseColor(data.fillColor, data.fillOpacity);
      polyline.push('fillcolor:' + fillcolor);
    }

    var path = data.path;
    if (path.join) {
      for (var j=0, pos; pos=path[j]; j++) {
        polyline.push(pos.join(','));
      }
    }
    else {
      polyline.push('enc:' + path);
    }

    polyline = polyline.join('|');
    parameters.push('path=' + encodeURI(polyline));
  }

  /** Retina support **/
  var dpi = window.devicePixelRatio || 1;
  parameters.push('scale=' + dpi);

  parameters = parameters.join('&');
  return static_root + parameters;
};

GMaps.prototype.addMapType = function(mapTypeId, options) {
  if (options.hasOwnProperty("getTileUrl") && typeof(options["getTileUrl"]) == "function") {
    options.tileSize = options.tileSize || new google.maps.Size(256, 256);

    var mapType = new google.maps.ImageMapType(options);

    this.map.mapTypes.set(mapTypeId, mapType);
  }
  else {
    throw "'getTileUrl' function required.";
  }
};

GMaps.prototype.addOverlayMapType = function(options) {
  if (options.hasOwnProperty("getTile") && typeof(options["getTile"]) == "function") {
    var overlayMapTypeIndex = options.index;

    delete options.index;

    this.map.overlayMapTypes.insertAt(overlayMapTypeIndex, options);
  }
  else {
    throw "'getTile' function required.";
  }
};

GMaps.prototype.removeOverlayMapType = function(overlayMapTypeIndex) {
  this.map.overlayMapTypes.removeAt(overlayMapTypeIndex);
};

GMaps.prototype.addStyle = function(options) {
  var styledMapType = new google.maps.StyledMapType(options.styles, { name: options.styledMapName });

  this.map.mapTypes.set(options.mapTypeId, styledMapType);
};

GMaps.prototype.setStyle = function(mapTypeId) {
  this.map.setMapTypeId(mapTypeId);
};

GMaps.prototype.createPanorama = function(streetview_options) {
  if (!streetview_options.hasOwnProperty('lat') || !streetview_options.hasOwnProperty('lng')) {
    streetview_options.lat = this.getCenter().lat();
    streetview_options.lng = this.getCenter().lng();
  }

  this.panorama = GMaps.createPanorama(streetview_options);

  this.map.setStreetView(this.panorama);

  return this.panorama;
};

GMaps.createPanorama = function(options) {
  var el = getElementById(options.el, options.context);

  options.position = new google.maps.LatLng(options.lat, options.lng);

  delete options.el;
  delete options.context;
  delete options.lat;
  delete options.lng;

  var streetview_events = ['closeclick', 'links_changed', 'pano_changed', 'position_changed', 'pov_changed', 'resize', 'visible_changed'],
      streetview_options = extend_object({visible : true}, options);

  for (var i = 0; i < streetview_events.length; i++) {
    delete streetview_options[streetview_events[i]];
  }

  var panorama = new google.maps.StreetViewPanorama(el, streetview_options);

  for (var i = 0; i < streetview_events.length; i++) {
    (function(object, name) {
      if (options[name]) {
        google.maps.event.addListener(object, name, function(){
          options[name].apply(this);
        });
      }
    })(panorama, streetview_events[i]);
  }

  return panorama;
};

GMaps.prototype.on = function(event_name, handler) {
  return GMaps.on(event_name, this, handler);
};

GMaps.prototype.off = function(event_name) {
  GMaps.off(event_name, this);
};

GMaps.custom_events = ['marker_added', 'marker_removed', 'polyline_added', 'polyline_removed', 'polygon_added', 'polygon_removed', 'geolocated', 'geolocation_failed'];

GMaps.on = function(event_name, object, handler) {
  if (GMaps.custom_events.indexOf(event_name) == -1) {
    return google.maps.event.addListener(object, event_name, handler);
  }
  else {
    var registered_event = {
      handler : handler,
      eventName : event_name
    };

    object.registered_events[event_name] = object.registered_events[event_name] || [];
    object.registered_events[event_name].push(registered_event);

    return registered_event;
  }
};

GMaps.off = function(event_name, object) {
  if (GMaps.custom_events.indexOf(event_name) == -1) {
    google.maps.event.clearListeners(object, event_name);
  }
  else {
    object.registered_events[event_name] = [];
  }
};

GMaps.fire = function(event_name, object, scope) {
  if (GMaps.custom_events.indexOf(event_name) == -1) {
    google.maps.event.trigger(object, event_name, Array.prototype.slice.apply(arguments).slice(2));
  }
  else {
    if(event_name in scope.registered_events) {
      var firing_events = scope.registered_events[event_name];

      for(var i = 0; i < firing_events.length; i++) {
        (function(handler, scope, object) {
          handler.apply(scope, [object]);
        })(firing_events[i]['handler'], scope, object);
      }
    }
  }
};

GMaps.geolocate = function(options) {
  var complete_callback = options.always || options.complete;

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(function(position) {
      options.success(position);

      if (complete_callback) {
        complete_callback();
      }
    }, function(error) {
      options.error(error);

      if (complete_callback) {
        complete_callback();
      }
    }, options.options);
  }
  else {
    options.not_supported();

    if (complete_callback) {
      complete_callback();
    }
  }
};

GMaps.geocode = function(options) {
  this.geocoder = new google.maps.Geocoder();
  var callback = options.callback;
  if (options.hasOwnProperty('lat') && options.hasOwnProperty('lng')) {
    options.latLng = new google.maps.LatLng(options.lat, options.lng);
  }

  delete options.lat;
  delete options.lng;
  delete options.callback;
  
  this.geocoder.geocode(options, function(results, status) {
    callback(results, status);
  });
};

//==========================
// Polygon containsLatLng
// https://github.com/tparkin/Google-Maps-Point-in-Polygon
// Poygon getBounds extension - google-maps-extensions
// http://code.google.com/p/google-maps-extensions/source/browse/google.maps.Polygon.getBounds.js
if (!google.maps.Polygon.prototype.getBounds) {
  google.maps.Polygon.prototype.getBounds = function(latLng) {
    var bounds = new google.maps.LatLngBounds();
    var paths = this.getPaths();
    var path;

    for (var p = 0; p < paths.getLength(); p++) {
      path = paths.getAt(p);
      for (var i = 0; i < path.getLength(); i++) {
        bounds.extend(path.getAt(i));
      }
    }

    return bounds;
  };
}

if (!google.maps.Polygon.prototype.containsLatLng) {
  // Polygon containsLatLng - method to determine if a latLng is within a polygon
  google.maps.Polygon.prototype.containsLatLng = function(latLng) {
    // Exclude points outside of bounds as there is no way they are in the poly
    var bounds = this.getBounds();

    if (bounds !== null && !bounds.contains(latLng)) {
      return false;
    }

    // Raycast point in polygon method
    var inPoly = false;

    var numPaths = this.getPaths().getLength();
    for (var p = 0; p < numPaths; p++) {
      var path = this.getPaths().getAt(p);
      var numPoints = path.getLength();
      var j = numPoints - 1;

      for (var i = 0; i < numPoints; i++) {
        var vertex1 = path.getAt(i);
        var vertex2 = path.getAt(j);

        if (vertex1.lng() < latLng.lng() && vertex2.lng() >= latLng.lng() || vertex2.lng() < latLng.lng() && vertex1.lng() >= latLng.lng()) {
          if (vertex1.lat() + (latLng.lng() - vertex1.lng()) / (vertex2.lng() - vertex1.lng()) * (vertex2.lat() - vertex1.lat()) < latLng.lat()) {
            inPoly = !inPoly;
          }
        }

        j = i;
      }
    }

    return inPoly;
  };
}

google.maps.LatLngBounds.prototype.containsLatLng = function(latLng) {
  return this.contains(latLng);
};

google.maps.Marker.prototype.setFences = function(fences) {
  this.fences = fences;
};

google.maps.Marker.prototype.addFence = function(fence) {
  this.fences.push(fence);
};

google.maps.Marker.prototype.getId = function() {
  return this['__gm_id'];
};

//==========================
// Array indexOf
// https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array/indexOf
if (!Array.prototype.indexOf) {
  Array.prototype.indexOf = function (searchElement /*, fromIndex */ ) {
      
      if (this == null) {
          throw new TypeError();
      }
      var t = Object(this);
      var len = t.length >>> 0;
      if (len === 0) {
          return -1;
      }
      var n = 0;
      if (arguments.length > 1) {
          n = Number(arguments[1]);
          if (n != n) { // shortcut for verifying if it's NaN
              n = 0;
          } else if (n != 0 && n != Infinity && n != -Infinity) {
              n = (n > 0 || -1) * Math.floor(Math.abs(n));
          }
      }
      if (n >= len) {
          return -1;
      }
      var k = n >= 0 ? n : Math.max(len - Math.abs(n), 0);
      for (; k < len; k++) {
          if (k in t && t[k] === searchElement) {
              return k;
          }
      }
      return -1;
  }
}
    return GMaps;
}));

(function(root, factory) {
    if(typeof exports === 'object') {
        module.exports = factory(require('umodel'), require('u'));
    }
    else if(typeof define === 'function' && define.amd) {
        define('microbox', ['umodel', 'u'], factory);
    }
    else {
        root['microbox'] = factory(root.umodel, root.u);
    }
}(this, function(umodel, u) {
var bound, keys, microbox, template;

template = function(data, id) {
  var caption, captions, images, item, items, n, pager, src, _i, _j, _k, _len, _len1, _len2, _ref, _ref1, _ref2;
  images = '';
  _ref = data.images;
  for (_i = 0, _len = _ref.length; _i < _len; _i++) {
    src = _ref[_i];
    images += "<img src=\"" + src + "\" alt=\"\" />";
  }
  captions = '';
  _ref1 = data.captions;
  for (n = _j = 0, _len1 = _ref1.length; _j < _len1; n = ++_j) {
    caption = _ref1[n];
    if (caption) {
      captions += "<div class=\"caption\" microbox-caption=\"" + n + "\">\n	<span class=\"microbox-button\" microbox-trigger-caption>i</span>\n	" + caption + "\n</div>";
    }
  }
  if (data.images.length > 1) {
    items = '';
    _ref2 = data.images;
    for (n = _k = 0, _len2 = _ref2.length; _k < _len2; n = ++_k) {
      item = _ref2[n];
      items += "<li microbox-trigger-set=\"" + id + "\" microbox-trigger-index=\"" + n + "\">" + (n + 1) + "</li>";
    }
    pager = "<ul class=\"microbox-pager\">\n	<li class=\"microbox-counts\">" + (data.active + 1) + "/" + data.images.length + "</li>\n	<li microbox-trigger-prev microbox-trigger-set=\"" + id + "\">&#9656;</li>\n	" + items + "\n	<li microbox-trigger-next microbox-trigger-set=\"" + id + "\">&#9656;</li>\n</ul>";
  } else {
    pager = '';
  }
  return "<span class=\"microbox-button microbox-close\" microbox-close>&times;</span>\n<div class=\"inner\">\n	" + images + "\n</div>\n" + captions + "\n" + pager;
};

bound = function(thing, min, max) {
  if (thing < min) {
    thing = min;
  } else if (thing > max) {
    thing = max;
  }
  return thing;
};

keys = {
  27: 'esc',
  37: 'left',
  39: 'right',
  65: 'a',
  68: 'd'
};

microbox = (function() {
  var attach, counter, getId, hide, init, model, next, prev, show, toggle,
    _this = this;
  counter = -1;
  model = new umodel({
    visible: null,
    sets: {}
  });
  getId = function() {
    while (!(++counter in (model.get('sets')))) {
      return counter;
    }
  };
  toggle = function(id, index, show) {
    var caption, components, element, max, set, verb;
    if (index == null) {
      index = 0;
    }
    if (id == null) {
      console.error("microbox.toggle expects a set ID, given '" + id + "'");
      return false;
    }
    set = model.get("sets/" + id);
    max = set.images.length - 1;
    element = set.element;
    if (set == null) {
      console.error("microbox.toggle passed an invalid set id '" + id + "'");
      return false;
    }
    index = bound(+index, 0, max);
    if (show === true) {
      verb = 'add';
    } else if (show === false) {
      verb = 'remove';
    } else {
      verb = 'toggle';
    }
    u.classList[verb](element, 'visible');
    if (u.classList.contains(element, 'visible')) {
      components = set.components;
      u.each(components.images, function(item) {
        return u.classList.remove(item, 'visible');
      });
      u.classList.add(components.images[index], 'visible');
      components.counts.innerHTML = "" + (index + 1) + "/" + set.images.length;
      u.each(components.pagerItems, function(item) {
        return u.classList.remove(item, 'active');
      });
      u.classList.add(components.pagerItems[index], 'active');
      verb = index === 0 ? 'add' : 'remove';
      u.classList[verb](components.prev, 'disabled');
      verb = index === max ? 'add' : 'remove';
      u.classList[verb](components.next, 'disabled');
      u.each(components.captions, function(item) {
        u.classList.add(item, 'hide');
        u.classList.remove(item, 'active');
        return item.style.top = '';
      });
      components.pager.style.bottom = '';
      caption = components.captions[index];
      if (caption) {
        u.classList.remove(caption, 'hide');
      }
      set.active = index;
      return model.set('visible', set);
    } else {
      return model.set('visible', null);
    }
  };
  attach = function(id, trigger) {
    var index, set;
    set = model.get("sets/" + id);
    index = set.triggers.indexOf(trigger);
    return trigger.addEventListener('click', function(e) {
      e.preventDefault();
      return toggle(id, index);
    });
  };
  init = function() {
    var triggers;
    triggers = document.querySelectorAll('a[href][rel^="lightbox"]');
    u.each(triggers, function(trigger) {
      var href, id, parts, rel, set, title;
      href = trigger.getAttribute('href');
      rel = trigger.getAttribute('rel');
      title = (trigger.getAttribute('title')) || '';
      parts = rel.split('[');
      if (parts[1]) {
        id = parts[1].slice(0, -1);
      } else {
        id = getId();
      }
      set = model.get("sets/" + id);
      if (set) {
        if ((set.triggers.indexOf(trigger)) < 0) {
          set.captions.push(title);
          set.images.push(href);
          set.triggers.push(trigger);
        }
      } else {
        model.set("sets/" + id, {
          captions: [title],
          images: [href],
          triggers: [trigger],
          active: 0,
          id: id
        });
      }
      return attach(id, trigger);
    });
    return u.each(model.get('sets'), function(set, id) {
      var element, html;
      html = template(set, id);
      element = document.createElement('div');
      element.className = 'microbox';
      element.innerHTML = html;
      document.body.appendChild(element);
      set = model.get("sets/" + id);
      set.element = element;
      set.components = {
        captions: [],
        counts: element.querySelector('.microbox-counts'),
        images: element.querySelectorAll('img'),
        pager: element.querySelector('.microbox-pager'),
        pagerItems: element.querySelectorAll('[microbox-trigger-index]'),
        next: element.querySelector('[microbox-trigger-next]'),
        prev: element.querySelector('[microbox-trigger-prev]')
      };
      return u.each(element.querySelectorAll('[microbox-caption]'), function(item) {
        id = +item.getAttribute('microbox-caption');
        return set.components.captions[id] = item;
      });
    });
  };
  document.addEventListener('click', function(e) {
    var caption, height, index, newTop, pager, screen, set, target, top;
    target = e.target;
    if ((u.classList.contains(target, 'inner')) || (target.hasAttribute('microbox-close'))) {
      return hide();
    } else if ((target.hasAttribute('microbox-trigger-index')) && (target.hasAttribute('microbox-trigger-set'))) {
      set = target.getAttribute('microbox-trigger-set');
      index = target.getAttribute('microbox-trigger-index');
      return toggle(set, index, true);
    } else if ((target.hasAttribute('microbox-trigger-next')) || (target.hasAttribute('microbox-trigger-prev'))) {
      if (target.hasAttribute('microbox-trigger-next')) {
        return next();
      } else {
        return prev();
      }
    } else if (target.hasAttribute('microbox-trigger-caption')) {
      caption = target.parentNode;
      height = caption.offsetHeight;
      screen = window.innerHeight;
      top = caption.style.top;
      pager = caption.parentNode.querySelector('.microbox-pager');
      if ((!top) || ((parseInt(top, 10)) === screen)) {
        newTop = screen - height;
        caption.style.top = "" + newTop + "px";
        u.classList.add(caption, 'active');
        return pager.style.bottom = "" + (height + 10) + "px";
      } else {
        u.classList.remove(caption, 'active');
        caption.style.top = '';
        return pager.style.bottom = '';
      }
    }
  });
  window.addEventListener('keydown', function(e) {
    var key, set;
    key = keys[e.keyCode];
    set = model.get('visible');
    if (key && set) {
      switch (key) {
        case 'esc':
          return hide();
        case 'left':
        case 'a':
          return prev();
        case 'right':
        case 'd':
          return next();
      }
    }
  });
  hide = function() {
    var id, index, set;
    set = model.get('visible');
    if (set) {
      id = set.id;
      index = model.get("sets/" + id + "/active");
      return toggle(id, null, false);
    } else {
      return console.error('microbox.hide() can only be called when a set is visible');
    }
  };
  show = function(id) {
    var available;
    if (model.get("sets/" + id)) {
      return toggle(id, null, true);
    } else {
      available = u.keys(model.get("sets"));
      return console.error("Set with ID '" + id + "' does not exist. Available sets: ", available);
    }
  };
  next = function() {
    var id, index, set;
    set = model.get('visible');
    if (set) {
      id = set.id;
      index = model.get("sets/" + id + "/active");
      return toggle(id, ++index, true);
    } else {
      return console.error('microbox.next() can only be called when a set is visible');
    }
  };
  prev = function() {
    var id, index, set;
    set = model.get('visible');
    if (set) {
      id = set.id;
      index = model.get("sets/" + id + "/active");
      return toggle(id, --index, true);
    } else {
      return console.error('microbox.prev() can only be called when a set is visible');
    }
  };
  init();
  return {
    init: init,
    next: next,
    prev: prev,
    hide: hide,
    show: show
  };
})();

    return microbox;
}));

//
// strftime
// github.com/samsonjs/strftime
// @_sjs
//
// Copyright 2010 - 2013 Sami Samhuri <sami@samhuri.net>
//
// MIT License
// http://sjs.mit-license.org
//

;(function() {

  //// Export the API
  var namespace;

  // CommonJS / Node module
  if (typeof module !== 'undefined') {
    namespace = module.exports = strftime;
  }

  // Browsers and other environments
  else {
    // Get the global object. Works in ES3, ES5, and ES5 strict mode.
    namespace = (function(){ return this || (1,eval)('this') }());
  }

  namespace.strftime = strftime;
  namespace.strftimeUTC = strftime.strftimeUTC = strftimeUTC;
  namespace.localizedStrftime = strftime.localizedStrftime = localizedStrftime;

  ////

  function words(s) { return (s || '').split(' '); }

  var DefaultLocale =
  { days: words('Sunday Monday Tuesday Wednesday Thursday Friday Saturday')
  , shortDays: words('Sun Mon Tue Wed Thu Fri Sat')
  , months: words('January February March April May June July August September October November December')
  , shortMonths: words('Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec')
  , AM: 'AM'
  , PM: 'PM'
  , am: 'am'
  , pm: 'pm'
  };

  function strftime(fmt, d, locale) {
    return _strftime(fmt, d, locale, false);
  }

  function strftimeUTC(fmt, d, locale) {
    return _strftime(fmt, d, locale, true);
  }

  function localizedStrftime(locale) {
    return function(fmt, d) {
      return strftime(fmt, d, locale);
    };
  }

  // locale is an object with the same structure as DefaultLocale
  function _strftime(fmt, d, locale, _useUTC) {
    // d and locale are optional so check if d is really the locale
    if (d && !quacksLikeDate(d)) {
      locale = d;
      d = undefined;
    }
    d = d || new Date();
    locale = locale || DefaultLocale;
    locale.formats = locale.formats || {};
    var msDelta = 0;
    if (_useUTC) {
      msDelta = (d.getTimezoneOffset() || 0) * 60000;
      d = new Date(d.getTime() + msDelta);
    }

    // Most of the specifiers supported by C's strftime, and some from Ruby.
    // Some other syntax extensions from Ruby are supported: %-, %_, and %0
    // to pad with nothing, space, or zero (respectively).
    return fmt.replace(/%([-_0]?.)/g, function(_, c) {
      var mod, padding;
      if (c.length == 2) {
        mod = c[0];
        // omit padding
        if (mod == '-') {
          padding = '';
        }
        // pad with space
        else if (mod == '_') {
          padding = ' ';
        }
        // pad with zero
        else if (mod == '0') {
          padding = '0';
        }
        else {
          // unrecognized, return the format
          return _;
        }
        c = c[1];
      }
      switch (c) {
        case 'A': return locale.days[d.getDay()];
        case 'a': return locale.shortDays[d.getDay()];
        case 'B': return locale.months[d.getMonth()];
        case 'b': return locale.shortMonths[d.getMonth()];
        case 'C': return pad(Math.floor(d.getFullYear() / 100), padding);
        case 'D': return _strftime(locale.formats.D || '%m/%d/%y', d, locale);
        case 'd': return pad(d.getDate(), padding);
        case 'e': return d.getDate();
        case 'F': return _strftime(locale.formats.F || '%Y-%m-%d', d, locale);
        case 'H': return pad(d.getHours(), padding);
        case 'h': return locale.shortMonths[d.getMonth()];
        case 'I': return pad(hours12(d), padding);
        case 'j':
          var y=new Date(d.getFullYear(), 0, 1);
          var day = Math.ceil((d.getTime() - y.getTime()) / (1000*60*60*24));
          return pad(day, 3);
        case 'k': return pad(d.getHours(), padding == null ? ' ' : padding);
        case 'L': return pad(Math.floor(d.getTime() % 1000), 3);
        case 'l': return pad(hours12(d), padding == null ? ' ' : padding);
        case 'M': return pad(d.getMinutes(), padding);
        case 'm': return pad(d.getMonth() + 1, padding);
        case 'n': return '\n';
        case 'o': return String(d.getDate()) + ordinal(d.getDate());
        case 'P': return d.getHours() < 12 ? locale.am : locale.pm;
        case 'p': return d.getHours() < 12 ? locale.AM : locale.PM;
        case 'R': return _strftime(locale.formats.R || '%H:%M', d, locale);
        case 'r': return _strftime(locale.formats.r || '%I:%M:%S %p', d, locale);
        case 'S': return pad(d.getSeconds(), padding);
        case 's': return Math.floor((d.getTime() - msDelta) / 1000);
        case 'T': return _strftime(locale.formats.T || '%H:%M:%S', d, locale);
        case 't': return '\t';
        case 'U': return pad(weekNumber(d, 'sunday'), padding);
        case 'u':
          var day = d.getDay();
          return day == 0 ? 7 : day; // 1 - 7, Monday is first day of the week
        case 'v': return _strftime(locale.formats.v || '%e-%b-%Y', d, locale);
        case 'W': return pad(weekNumber(d, 'monday'), padding);
        case 'w': return d.getDay(); // 0 - 6, Sunday is first day of the week
        case 'Y': return d.getFullYear();
        case 'y':
          var y = String(d.getFullYear());
          return y.slice(y.length - 2);
        case 'Z':
          if (_useUTC) {
            return "GMT";
          }
          else {
            var tz = d.toString().match(/\((\w+)\)/);
            return tz && tz[1] || '';
          }
        case 'z':
          if (_useUTC) {
            return "+0000";
          }
          else {
            var off = d.getTimezoneOffset();
            return (off < 0 ? '+' : '-') + pad(Math.abs(off / 60)) + pad(off % 60);
          }
        default: return c;
      }
    });
  }

  var RequiredDateMethods = ['getTime', 'getTimezoneOffset', 'getDay', 'getDate', 'getMonth', 'getFullYear', 'getYear', 'getHours', 'getMinutes', 'getSeconds'];
  function quacksLikeDate(x) {
    var i = 0
      , n = RequiredDateMethods.length
      ;
    for (i = 0; i < n; ++i) {
      if (typeof x[RequiredDateMethods[i]] != 'function') {
        return false;
      }
    }
    return true;
  }

  // Default padding is '0' and default length is 2, both are optional.
  function pad(n, padding, length) {
    // pad(n, <length>)
    if (typeof padding === 'number') {
      length = padding;
      padding = '0';
    }

    // Defaults handle pad(n) and pad(n, <padding>)
    if (padding == null) {
      padding = '0';
    }
    length = length || 2;

    var s = String(n);
    // padding may be an empty string, don't loop forever if it is
    if (padding) {
      while (s.length < length) s = padding + s;
    }
    return s;
  }

  function hours12(d) {
    var hour = d.getHours();
    if (hour == 0) hour = 12;
    else if (hour > 12) hour -= 12;
    return hour;
  }

  // Get the ordinal suffix for a number: st, nd, rd, or th
  function ordinal(n) {
    var i = n % 10
      , ii = n % 100
      ;
    if ((ii >= 11 && ii <= 13) || i === 0 || i >= 4) {
      return 'th';
    }
    switch (i) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
    }
  }

  // firstWeekday: 'sunday' or 'monday', default is 'sunday'
  //
  // Pilfered & ported from Ruby's strftime implementation.
  function weekNumber(d, firstWeekday) {
    firstWeekday = firstWeekday || 'sunday';

    // This works by shifting the weekday back by one day if we
    // are treating Monday as the first day of the week.
    var wday = d.getDay();
    if (firstWeekday == 'monday') {
      if (wday == 0) // Sunday
        wday = 6;
      else
        wday--;
    }
    var firstDayOfYear = new Date(d.getFullYear(), 0, 1)
      , yday = (d - firstDayOfYear) / 86400000
      , weekNum = (yday + 7 - wday) / 7
      ;
    return Math.floor(weekNum);
  }

}());

define("strftime", (function (global) {
    return function () {
        var ret, fn;
        return ret || global.strftime;
    };
}(this)));

(function (root, factory) {
	if (typeof exports === 'object') {
		module.exports = factory();
	} else if (typeof define === 'function' && define.amd) {
		define('uxhr', factory);
	} else {
		root.uxhr = factory();
	}
}(this, function () {

	

	return function (url, data, options) {

		data = data || '';
		options = options || {};

		var complete = options.complete || function(){},
			success = options.success || function(){},
			error = options.error || function(){},
			headers = options.headers || {},
			method = options.method || 'GET',
			sync = options.sync || false,
			req = (function() {

				if (typeof 'XMLHttpRequest' !== 'undefined') {

					// CORS (IE8-9)
					if (url.indexOf('http') === 0 && typeof XDomainRequest !== 'undefined') {
						return new XDomainRequest();
					}

					// local, CORS (other browsers)
					return new XMLHttpRequest();
					
				} else if (typeof 'ActiveXObject' !== 'undefined') {
					return new ActiveXObject('Microsoft.XMLHTTP');
				}

			})();

		if (!req) {
			throw new Error ('Browser doesn\'t support XHR');
		}

		// serialize data?
		if (typeof data !== 'string') {
			var serialized = [];
			for (var datum in data) {
				serialized.push(datum + '=' + data[datum]);
			}
			data = serialized.join('&');
		}

		// set timeout
		if ('ontimeout' in req) {
			req.ontimeout = +options.timeout || 0;
		}

		// listen for XHR events
		req.onload = function () {
			complete(req.responseText, req.status);
			success(req.responseText);
		};
		req.onerror = function () {
			complete(req.responseText);
			error(req.responseText, req.status);
		};

		// open connection
		req.open(method, (method === 'GET' && data ? url+'?'+data : url), sync);

		// set headers
		for (var header in headers) {
			req.setRequestHeader(header, headers[header]);
		}

		// send it
		req.send(method !== 'GET' ? data : null);
	};

}));
define('resume',['require','annie','bubblegraph','GMaps','microbox','strftime','umodel','util','uxhr','u'],function(require) {
  var BubbleGraph, GMaps, Resume, annie, microbox, strftime, u, umodel, util, uxhr;
  annie = require('annie');
  BubbleGraph = require('bubblegraph');
  GMaps = require('GMaps');
  microbox = require('microbox');
  strftime = require('strftime');
  umodel = require('umodel');
  util = require('util');
  uxhr = require('uxhr');
  u = require('u');
  return Resume = (function() {
    Resume.prototype.options = {
      name: 'John Smith',
      contact: {},
      element: document.body,
      history: [],
      objective: '',
      skills: [],
      colors: ['0B486B', 'A8DBA8', '79BD9A', '3B8686', 'CFF09E'],
      templateHeader: function() {
        var contacts, key, value, _labels, _ref, _template;
        _labels = {
          email: 'Email',
          github: 'GitHub',
          npm: 'NPM',
          www: 'Web'
        };
        _template = function(type, value) {
          switch (type) {
            case 'email':
              return "mailto:" + value;
            case 'github':
              return "https://github.com/" + value;
            case 'npm':
              return "https://npmjs.org/~" + value;
            case 'www':
              if (value.indexOf('http') !== 0) {
                return "http://" + value;
              } else {
                return value;
              }
          }
        };
        contacts = '';
        _ref = this.contact;
        for (key in _ref) {
          value = _ref[key];
          contacts += "<li><a class=\"" + key + "\" href=\"" + (_template(key, value)) + "\">" + _labels[key] + "</a></li>";
        }
        return "<header>\n	<h1>" + this.name + "'s Resume</h1>\n	<ul>" + contacts + "</ul>\n</header>";
      },
      templateCover: function() {
        var skills;
        skills = '<span class="tag">' + this.skills.join('</span><span class="tag">') + '</span>';
        return "<div id=\"cover\">\n	<h3 id=\"objective\">" + (marked(this.objective)) + "</h3>\n	<div id=\"skills\">" + skills + "</div>\n</div>";
      },
      templateHistory: function() {
        return "<div id=\"details\" class=\"hide\">\n	" + this.content + "\n</div>";
      },
      templateHistoryItem: function() {
        var data, date, fields, from, image, images, item, location, map, n, responsibilities, skills, to, url, _i, _j, _len, _len1, _ref;
        if (this.when[1] === null) {
          date = new Date();
          this.when[1] = "" + (date.getFullYear()) + "-" + (date.getMonth());
        }
        from = strftime('%B %Y', util.strtotime(this.when[0]));
        to = strftime('%B %Y', util.strtotime(this.when[1]));
        if (this.location) {
          location = (this.location.city ? "" + this.location.city + "," : '') + ' ' + (this.location.state || '');
        } else {
          location = '';
        }
        responsibilities = '- ' + this.responsibilities.join('\n- ');
        skills = '<span class="tag">' + this.skills.join('</span><span class="tag">') + '</span>';
        data = [
          {
            field: 'company',
            value: "**" + this.company + "**"
          }, {
            field: 'title',
            value: this.title
          }, {
            field: 'location',
            value: location
          }, {
            field: 'when',
            value: "" + from + " - " + to
          }, {
            field: 'description',
            value: this.description
          }, {
            field: 'responsibilities',
            value: responsibilities
          }, {
            field: 'skills',
            value: skills
          }
        ];
        fields = '';
        for (_i = 0, _len = data.length; _i < _len; _i++) {
          item = data[_i];
          if (item.value != null) {
            fields += "<dt>" + item.field + "</dt><dd>" + (marked(item.value)) + "</dd>";
          }
        }
        if (this.images) {
          images = '<dt>Screenshots</dt><dd><ul class="images">';
          _ref = this.images;
          for (n = _j = 0, _len1 = _ref.length; _j < _len1; n = ++_j) {
            image = _ref[n];
            url = "data/images/" + image;
            images += "<li><a href=\"" + url + "\" rel=\"lightbox[" + this.company + "]\"><img src=\"" + url + "\" alt=\"" + this.company + " screenshot\" /></a></li>";
          }
          images += '</ul></dd>';
        } else {
          images = '';
        }
        if (this.location) {
          map = "<span class=\"map-placeholder\">\n	Loading<br />\n	map...\n	<span class=\"spinner\"></span>\n</span>";
        } else {
          map = '';
        }
        return "<section class=\"detail hide\">\n	" + map + "\n	<dl>\n		" + fields + "\n		" + images + "\n	</dl>\n</section>";
      }
    };

    Resume.prototype.model = new umodel({
      graph: null
    });

    function Resume(options) {
      util.log('loaded!');
      _.extend(this.options, options);
      this.attachEvents();
      document.title = "" + this.options.name + "'s Resume";
      this.render();
      this.resize();
      util.log('rendered!');
    }

    Resume.prototype.attachEvents = function() {
      var _this = this;
      document.addEventListener('click', function(e) {
        return _this.clickBody(e);
      });
      window.addEventListener('resize', function() {
        return _this.resize;
      });
      return window.addEventListener('deviceorientation', function() {
        return _this.resize;
      });
    };

    Resume.prototype.clickBody = function(event) {
      var element, graph, isCircle, isClickMeText, isDetails, isLightbox;
      element = event.target;
      isCircle = this.isCircle(element);
      isDetails = this.getDetails(element);
      isClickMeText = this.isClickMeText(element);
      isLightbox = this.isLightbox(element);
      graph = this.model.get('graph');
      if (isLightbox) {
        return false;
      }
      if (!isCircle && !isDetails && !isClickMeText && graph) {
        graph.deactivate();
        return u.classList.remove(document.querySelector('svg'), 'small');
      }
    };

    Resume.prototype.isLightbox = function(element) {
      while (element !== document) {
        if (u.classList.contains(element, 'microbox')) {
          return true;
        }
        element = element.parentNode;
      }
    };

    Resume.prototype.isCircle = function(element) {
      return element.tagName === 'circle';
    };

    Resume.prototype.isDetails = function(element) {
      return element.id === 'details';
    };

    Resume.prototype.isClickMeText = function(element) {
      return element.id === 'clickme';
    };

    Resume.prototype.getDetails = function(element) {
      while (element !== document) {
        if (this.isDetails(element)) {
          return element;
        }
        element = element.parentNode;
      }
    };

    Resume.prototype.render = function() {
      var queue,
        _this = this;
      queue = [
        {
          fn: 'renderHistory',
          log: 'rendered history!'
        }, {
          fn: 'clearSpinner'
        }, {
          fn: 'renderMaps',
          log: 'rendered maps!'
        }, {
          fn: 'renderBubbles',
          log: 'rendered bubbles!'
        }, {
          fn: 'initLightboxes',
          log: 'initialized lightboxes'
        }, {
          fn: 'getRepoCount',
          log: 'rendered repo counts!'
        }
      ];
      return _.each(queue, function(item) {
        _.defer(_.bind(_this[item.fn], _this));
        if (item.log) {
          return util.log(item.log);
        }
      });
    };

    Resume.prototype.clearSpinner = function() {
      var spinner;
      spinner = document.querySelector('#loading');
      return u.classList.add(spinner, 'fade-out');
    };

    Resume.prototype.initLightboxes = function() {
      return microbox.init();
    };

    Resume.prototype.renderHistory = function() {
      var html, htmlDetails, item, _i, _len, _ref;
      html = htmlDetails = '';
      html += this.options.templateHeader.call(this.options);
      html += this.options.templateCover.call(this.options);
      _ref = this.options.history;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        item = _ref[_i];
        htmlDetails += this.options.templateHistoryItem.call(item);
      }
      html += this.options.templateHistory.call({
        content: htmlDetails
      });
      return this.options.element.innerHTML = html;
    };

    Resume.prototype.renderBubbles = function() {
      var graph;
      graph = new BubbleGraph({
        colors: this.options.colors,
        data: this.options.history,
        element: this.options.element
      });
      return this.model.set('graph', graph);
    };

    Resume.prototype.renderMaps = function() {
      var details, placeholders, width,
        _this = this;
      details = document.querySelector('#details');
      u.classList.remove(details, 'hide');
      width = details.offsetWidth - 20;
      u.classList.add(details, 'hide');
      placeholders = details.querySelectorAll('.map-placeholder');
      return _.each(this.options.history, function(item, n) {
        var address, img, location, src;
        location = item.location;
        if (location) {
          address = "" + (location.address || '') + " " + (location.city || '') + " " + (location.state || '');
          src = GMaps.staticMapURL({
            address: address,
            markers: [
              {
                color: _this.options.colors[n % _this.options.colors.length],
                address: address
              }
            ],
            size: [width, 150],
            zoom: 9
          });
          img = document.createElement('img');
          img.alt = '';
          img.className = 'map';
          img.src = src;
          img.width = width;
          return img.onload = function() {
            u.classList.add(placeholders[n], 'fade-out');
            return setTimeout(function() {
              placeholders[n].parentNode.replaceChild(img, placeholders[n]);
              return _.defer(function() {
                return u.classList.add(img, 'fade-in');
              });
            }, 200);
          };
        }
      });
    };

    Resume.prototype.templateRepoCounts = function(counts) {
      var count, element, platform, _ref, _results;
      _ref = JSON.parse(counts);
      _results = [];
      for (platform in _ref) {
        count = _ref[platform];
        if (typeof count === 'number') {
          _results.push((function() {
            var _i, _len, _ref1, _results1;
            _ref1 = document.querySelectorAll("." + platform);
            _results1 = [];
            for (_i = 0, _len = _ref1.length; _i < _len; _i++) {
              element = _ref1[_i];
              _results1.push(element.innerHTML += " (" + count + ")");
            }
            return _results1;
          })());
        }
      }
      return _results;
    };

    Resume.prototype.getRepoCount = function() {
      return uxhr('http://www.contributor.io/api', this.options.contact, {
        success: this.templateRepoCounts
      });
    };

    Resume.prototype.resize = function() {
      var bin, property, rotate, rule, scale, sheet, value, x, y;
      scale = .7;
      rotate = -60;
      x = -28;
      y = -27;
      bin = Math.floor(this.options.element.offsetHeight / 100);
      if (bin < 5) {
        scale = (bin + 1) / 10;
        rotate = -60 + 20 * (5 - bin);
      }
      property = 'transform';
      value = "scale(" + scale + ") translate3d(" + x + "%, " + y + "%, 0) rotate(" + rotate + "deg);";
      rule = "svg.small {\n	-" + (annie.vendor.toLowerCase()) + "-" + property + ": " + value + "\n	" + property + ": " + value + "\n}";
      sheet = document.styleSheets[0];
      return sheet.insertRule(rule, sheet.cssRules.length);
    };

    return Resume;

  })();
});

define('main',['require','resume','uxhr'],function(require) {
  var Resume, init, load, uxhr;
  Resume = require('resume');
  uxhr = require('uxhr');
  init = function(data) {
    return new Resume(_.extend(data, {
      element: document.getElementById('resume')
    }));
  };
  load = function(url, callback) {
    return uxhr(url, {}, {
      complete: function(res) {
        return callback(JSON.parse(res));
      }
    });
  };
  return load('data/data.json', init);
});

require(['config', 'main']);

define("app.js", function(){});
}());