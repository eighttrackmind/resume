var __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };

define(function(require) {
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
