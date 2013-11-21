// Generated by CoffeeScript 1.6.3
(function() {
  define(function(require) {
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
      },
      classList: {
        add: function(element, className) {
          return element.className += className;
        },
        remove: function(element, className) {
          var regex;
          regex = new RegExp("(^|\\s)" + className + "(?:\\s|$)");
          return element.className = element.className.replace(regex, '$1');
        },
        contains: function(element, className) {
          return (element.className.indexOf(className)) > -1;
        }
      }
    };
  });

}).call(this);
