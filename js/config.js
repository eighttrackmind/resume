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
