var express = require('express');
var router = express.Router();
const userController = require('../controllers/user-controller');
var responseHandler = require('../utils/response-handler.util');

/**
 * Servicio para iniciar sesión en la aplicación 
 * @param {String} req.email Correo electrónico del usuario
 * @param {String} req.password Contraseña del usuario encriptada
 * @returns {any} Devuelve una cookie con el perfil y usuario logeado
 */
router.post('/login', async (req, res , next)=>{
  // Validaciones
  if(!req.body.email || !req.body.password){
    responseHandler.sendResponse(req,res,next, 400, 'Missing required values');
    return;
  }

  // Busca al usuario en BD por correo electrónico
  var user = await userController.getUserByEmail(req.body.email);

  if(user.length > 0){  // Si el usuario existe en BDD...
    
    if(user[0].password === req.body.password){ // Valida la contraseña
      var session = req.session;
      // Guarda el correo y ID del usuario en la sesión del usuario
      session.user = user[0].email;
      session.userId = user[0].id;
      
      var resMsg = {
        message: 'Login successful',
        expiresAt: session.cookie.expires
      }
      responseHandler.sendResponse(req,res,next, 200, resMsg);
      return;
    }
  }
  // Si no existe el usuario en BDD o la contraseña es incorrecta
  responseHandler.sendResponse(req,res,next, 401, 'Invalid username or password');
});

/*
  Servicio para registrar a un usuario
*/
router.post('/register', (req, res , next)=>{
  // Validacion de parámetros
  if(!req.body.email || !req.body.password || !req.body.firstname || 
      !req.body.lastname || !req.body.phone){
    responseHandler.sendResponse(req,res,next, 400, 'Missing required values');
    return;
  }

  // Valida si ya existe un usuario con el correo ingresado
  userController.getUserByEmail(req.body.email).then((user) => {
    console.log(user);

    if(user.length > 0){ // Si el contacto ya está registrado...
      responseHandler.sendResponse(req, res, next, 400, 'The email submitted already exists for another user');
    }
    else { // Si el contacto no está registrado...
      userController.create(req).then((resp) => { // Si el usuario se creó correctamente...
        responseHandler.sendResponse(req,res,next, 200, 'User created successfully');
      }).catch((error) => {
        var errMsg = "Failed to insert record to database: " + error.original.code;
        responseHandler.sendResponse(req,res,next, 500, errMsg);
      });
    }
  }).catch((error) => {
    var resMsg = "Failed to retrieve record from database: " + error.original.code;
    responseHandler.sendResponse(req,res,next, 500, resMsg);
  });

});


/**
 * Destruye la cookie con la sesión del usuario
 * @param {cookie} session Recibe una cookie con la sesión del usuario
 */
router.post('/logout',(req,res,next) => {
  try {
    req.session.destroy();
    responseHandler.sendResponse(req,res,next, 200, 'Logout successful');
  } catch (error) {
    console.log(error)
    responseHandler.sendResponse(req,res,next, 500, 'Could not delete session cookie');
  }
});

// Servicio para cambiar la contraseña del usuario
router.post('/password', async (req, res , next)=>{
  const userEmail = req.session.user;

  // Validación de parámetros
  if(!req.body.oldPassword || !req.body.newPassword){
    responseHandler.sendResponse(req,res,next, 400, 'Missing required values');
    return;
  }

  // Busca al usuario en BD por correo electrónico
  var user = await userController.getUserByEmail(userEmail);

  if(user.length > 0){  // Si el usuario existe en BDD
    
    if(user[0].password === req.body.oldPassword){ // Valida la contraseña anterior

      // Guarda la nueva contraseña en BDD
      user[0].password = req.body.newPassword;
      user[0].save();
      responseHandler.sendResponse(req,res,next, 200, 'Password updated');
    }
    else
      responseHandler.sendResponse(req,res,next, 400, 'The old password is incorrect');
  }
  else{
    // Si no existe el usuario en BDD
    responseHandler.sendResponse(req,res,next, 401, 'User not found');
  }
});

module.exports = router;
