var express = require('express');
var router = express.Router();
const axios = require('axios');
var sessionUtils = require('../utils/session-checker.util');
var responseHandler = require('../utils/response-handler.util');
const contactController = require('../controllers/contact-controller');

const E164_REGEX = /^\+[1-9]\d{10,14}$/; // Expresión regular para validar número telefónico (formato E.164)

// Registra un contacto de confianza asociado a un usuario
router.post('/register', sessionUtils.validateSession, (req, res , next)=>{
  var userId = req.session.userId;

  // Valida los parámetros de entrada
  if(!req.body.contactPhone || !req.body.contactName){
    responseHandler.sendResponse(req, res, next, 400, 'Incorrect request parameters');
    return;
  }

  // Valida el formato teléfonico
  // Si no tiene código de país, agrega el código de país de México (+52)
  if(!E164_REGEX.test(req.body.contactPhone)){
    if(req.body.contactPhone[0] !== '+')
      req.body.contactPhone = '+52' + req.body.contactPhone;
    if(!E164_REGEX.test(req.body.contactPhone)){
      responseHandler.sendResponse(req, res, next, 400, 'Invalid phone number');
      return;
    }
  }

  // Valida que el teléfono del contacto de confianza no esté ya registrado para un mismo usuario
  contactController.getTrustedContacts(userId).then((trustedCont) => {
    var existContact = trustedCont.find(contact => contact.phone === req.body.contactPhone);

    if(existContact){ // Si el contacto ya está registrado...
      responseHandler.sendResponse(req, res, next, 400, 'A trusted contact with the phone number submitted already exists');
    }
    else { // Si el contacto no está registrado...
      contactController.create(req.body, userId).then((contact) => {
        // Alta del contacto en AWS SNS mediante callout a un servicio

        // Construye cuerpo de la petición
        var reqBody = {
          contact: {
            external_id: contact.external_id,
            name: contact.name,
            phone: contact.phone
          }
        }

        // Envía petición para dar de alta al contacto en AWS SNS
        axios.post('http://httpbin.org/post', reqBody)
          .then(function (calloutRes) {
            if (calloutRes.status === 200) { // Alta en AWS exitosa
              // console.log('RESPONSE DATA \n:', calloutRes.data);

              // Verifica que la respuesta contenga el tópico SNS  
              //----------------------------------------------------------------------------DESCOMENTAR
              // if(!calloutRes.data.TopicArn){
              //   responseHandler.sendResponse(req, res, next, 500, 'Could not create SNS topic');
              //   return;
              // }

              // ----------------------------------------------------------------------------ELIMINAR
              calloutRes.data.TopicArn = 'arn:aws:sns:us-east-2:402433848122:SNS-Topic-SNS-Topic-2c838594-d317-4042-8f16-8a75e5bcf594';

              // Actualiza el contacto en BD para agregar el SNS Topic generado
              contactController.updateSNSTopic(contact.id, calloutRes.data.TopicArn).then((updRes) => {
                responseHandler.sendResponse(req, res, next, 200, 'Contact successfully registered');
              })
              .catch((error) => { // Error al actualizar contacto en BD con el SNS Topic
                console.log(error)
                var resMsg = "Failed to update record with SNS topic";
                responseHandler.sendResponse(req, res, next, 500, resMsg);
              });
          
              
            }
            else { // Respuesta de error por parte del servico de alta
              console.log(calloutRes);
              responseHandler.sendResponse(req, res, next, 500, 'Could not create SNS topic');
            }
          })
          .catch(function (error) { // Error al consumir servico de alta
            console.log(error);
            responseHandler.sendResponse(req, res, next, 500, 'Could not create SNS topic');
          });

      }).catch((error) => { // Error al crear contacto en BD
        console.log(error)
        var resMsg = "Failed to insert record to database";
        responseHandler.sendResponse(req, res, next, 500, resMsg);
      });
    }
  }).catch((error) => { // Error al intentar buscar contacto en BD
    console.log(error)
    var resMsg = "Failed to retrieve record from database";
    responseHandler.sendResponse(req,res,next, 500, resMsg);
  });

});

// Edita el número o nombre de un contacto de confianza
router.post('/edit', sessionUtils.validateSession, (req, res , next)=>{
  var userId = req.session.userId;

  // Valida los parámetros de entrada
  if(!req.body.previousPhone || !req.body.contactName || !req.body.newPhone){
    responseHandler.sendResponse(req, res, next, 400, 'Incorrect request parameters');
    return;
  }

  var prevPhone = req.body.previousPhone;
  var newPhone = req.body.newPhone;
  var contactName = req.body.contactName; 

  // Valida el formato teléfonico
  // Si no tiene código de país, agrega el código de país de México (+52)
  if(!E164_REGEX.test(prevPhone)){
    if(prevPhone[0] !== '+')
      prevPhone = '+52' + prevPhone;
    if(!E164_REGEX.test(prevPhone)){
      responseHandler.sendResponse(req, res, next, 400, 'Invalid phone number');
      return;
    }
  }
    
  if(!E164_REGEX.test(newPhone)){
    if(newPhone[0] !== '+')
      newPhone = '+52' + newPhone;
    if(!E164_REGEX.test(newPhone)){
      responseHandler.sendResponse(req, res, next, 400, 'Invalid phone number');
      return;
    }
  }
    
  // Obtiene el contacto de confianza asociado al número telefónico
  contactController.getContact(userId, prevPhone).then(async(contact) => {
    
    if(contact.length === 0){ // Si no se encuentra el contacto en BD
      responseHandler.sendResponse(req, res, next, 400, 'Non-existent contact');
      return;
    }

    // Si se modificó el número, verifica que el nuevo número no esté ya registrado
    if(prevPhone != newPhone){
      var alreadyRegistered = await contactController.getContact(userId, newPhone);

      if(alreadyRegistered.length > 0){
        responseHandler.sendResponse(req, res, next, 400, 'A trusted contact with the phone number submitted already exists');
        return;
      }
    }

    // Actualiza el contacto con los nuevos valores
    contact[0].name = contactName;
    contact[0].phone = newPhone;
    await contact[0].save();
    responseHandler.sendResponse(req,res,next, 200, 'Contact updated');
  })
  .catch((error) => {
    console.log(error);
    responseHandler.sendResponse(req,res,next, 500, 'Failed to retrieve record from database');
  });

});

// Elimina un contacto de confianza asociado a un usuario
router.delete('/:contactPhone', sessionUtils.validateSession, (req, res , next)=>{
  var userId = req.session.userId;

  // Valida los parámetros de entrada
  if(!req.params.contactPhone){
    responseHandler.sendResponse(req, res, next, 400, 'Incorrect request parameters');
    return;
  }

  // Valida el formato teléfonico
  // Si no tiene código de país, agrega el código de país de México (+52)
  if(!E164_REGEX.test(req.params.contactPhone)){
    if(req.params.contactPhone[0] !== '+')
      req.params.contactPhone = '+52' + req.params.contactPhone;
    if(!E164_REGEX.test(req.params.contactPhone)){
      responseHandler.sendResponse(req, res, next, 400, 'Invalid phone number');
      return;
    }
  }

  // Obtiene el contacto asociado al número telefónico
  contactController.getContact(userId, req.params.contactPhone).then(async(contact) => {
    if(contact.length === 0){ // Si no se encuentra el contacto en BD
      responseHandler.sendResponse(req, res, next, 400, 'Non-existent contact');
      return;
    }

    // Elimina el contacto
    await contact[0].destroy();
    responseHandler.sendResponse(req, res, next, 200, 'Contact deleted');
  })
  .catch((error) => {
    console.log(error);
    responseHandler.sendResponse(req,res,next, 500, 'Failed to retrieve record from database');
  });



});

module.exports = router;
