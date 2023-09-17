var express = require('express');
var sessionUtils = require('../utils/session-checker.util');
var router = express.Router();

// router.use(sessionUtils.validateSession);

// Servicio para probar funcionamiento y conectividad con el middleware
router.get('/', sessionUtils.validateSession, function(req, res, next) {

  res.json({
    data: {
      message: 'Hola mundo'
    }
  });
});

module.exports = router;
