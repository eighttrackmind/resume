var __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };

define(function(require) {
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
