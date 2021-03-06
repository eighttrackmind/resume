define(function(require) {
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
