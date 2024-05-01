var express = require('express');
var router = express.Router();
const axios = require('axios');
var sessionUtils = require('../utils/session-checker.util');
var responseHandler = require('../utils/response-handler.util');
var s3Util = require('../utils/aws-s3.util');
var ann = require('../utils/neural-network.util');

const incidentController = require('../controllers/incident-controller');
const incPhotoController = require('../controllers/incidentphoto-controller');
const inCatController = require('../controllers/incidentcategory-controller');

const multer = require('multer');
const { json } = require('sequelize');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // Tamaño máximo de archivo 100MB
  },
});

// Registra un incidente disparado por el botón de pánico
router.post('/start', sessionUtils.validateSession, (req, res , next)=>{
    var userId = req.session.userId;

    // Valida los parámetros de entrada
    if(!req.body.longitude || !req.body.latitude || isNaN(req.body.longitude) || isNaN(req.body.latitude)){
        responseHandler.sendResponse(req, res, next, 400, 'Incorrect request parameters');
        return;
    }

    // Crea en incidente en BD
    incidentController.create(req.body, userId).then(async(incident) => {
        const usr = await incident.getUser(); // Obtiene el usuario que levantó la alerta

        const hasContacts = await usr.countContacts(); // Verifica si el usuario tiene contactos registrados
        console.log(hasContacts);

        if(!hasContacts){ // Si el usuario no tiene contactos registrados solo crea el incidente y termina la ejecución
            var resMsg = {
                message: 'Incident successfully created. No contacts to notify.',
                incidentId: incident.id
            };
            responseHandler.sendResponse(req, res, next, 200, resMsg);
            return;
        }

        const contacts = await usr.getContacts(); // Obtiene los contactos registrados por el usuario
        
        var contactsData = [];

        // Construye arreglo con datos del contacto que se enviarán
        for(var contact of contacts){
            var contData = {
                external_id: contact.external_id,
                name: contact.name,
                phone: contact.phone,
                sms_topic: contact.sms_topic
            }
            contactsData.push(contData);
        }

        // Construye cuerpo de la petición
        var reqBody = {
            userId: userId,
            userName: usr.firstname + ' ' + usr.lastname,
            incidentId: incident.id,
            contacts: contactsData
        }
        
        // Envía petición al middleware de la plataforma web para notificar a contactos de confianza
        axios.post('https://api.safetyguard.com.mx/incidents/notificate/contacts', reqBody)
            .then(function (calloutRes) {
                console.log(calloutRes.data);
                console.log(reqBody);
                if(calloutRes.status === 201){
                    var resMsg = {
                        message: 'Incident successfully created',
                        incidentId: incident.id
                    };
                    responseHandler.sendResponse(req, res, next, 200, resMsg);
                }
                else{
                    console.log(calloutRes);
                    responseHandler.sendResponse(req, res, next, 500, 'Could not notify contacts');
                }
            })
            .catch(function (error) {
                console.log(error);
                responseHandler.sendResponse(req, res, next, 500, 'Could not notify contacts');
            });

    }).catch((error) => {
        console.log(error)
        var resMsg = "Failed to insert record to database";
        responseHandler.sendResponse(req, res, next, 500, resMsg);
    });
});

// Actualiza los datos de geolocalización del usuario
router.post('/refresh', sessionUtils.validateSession, (req, res , next)=>{
    var userId = req.session.userId;

    // Valida los parámetros de entrada
    if(!req.body.longitude || !req.body.latitude || isNaN(req.body.longitude) || isNaN(req.body.latitude) || !req.body.incidentId){
        responseHandler.sendResponse(req, res, next, 400, 'Incorrect request parameters');
        return;
    }
    var incidentId = req.body.incidentId;
    var latitude = req.body.latitude;
    var longitude = req.body.longitude;

    // Obtiene el incidente con el ID recibido
    var incident = incidentController.getIncident(incidentId).then((giRes) => {
        // Actualiza los datos de geolocalización relacionados al incidente

        if(giRes.length === 0){ // Si no existen incidentes con el ID recibido...
            responseHandler.sendResponse(req, res, next, 400, 'Non-existent incident');
            return;
        }

        incidentController.updateLocation(incidentId, latitude, longitude).then((resUpd) => {
            responseHandler.sendResponse(req, res, next, 200, 'Location updated successfully');
        })
        .catch((error) => {
            console.log(error);
            var resMsg = "Update record failed";
            responseHandler.sendResponse(req, res, next, 500, resMsg);
        });

        console.log(giRes);
    })
    .catch((error) => {
        console.log(error);
        var resMsg = "Failed to retrieve record from database";
        responseHandler.sendResponse(req,res,next, 500, resMsg);
    });

});

// Servicio llamado al finalizar la situación de peligro
router.post('/finish', upload.fields([
    { name: 'photos', maxCount: 10 },
    { name: 'audio', maxCount: 1 }
  ]), sessionUtils.validateSession, async(req, res , next)=>{
    var userId = req.session.userId;

    // Valida los parámetros de entrada
    if(!req.body.incidentId){
        responseHandler.sendResponse(req, res, next, 400, 'Incident ID is required');
        return;
    }

    var incidentId = req.body.incidentId;
    var photos = req.files.photos;
    var audio = req.files.audio;

    // Obtiene el incidente con el ID recibido
    incidentController.getIncident(incidentId).then((incident) => {
        var evidenceSent = false; // Indica si se enviaron evidencias (foto, audio)
        var audioKey = null;
        var photosFolder = null;
        var uploads = [];

        const audioPrefix = 'audio-recordings/';
        const photosPrefix = 'photos/'+ incidentId + '/';

        if(incident.length === 0){ // Si no existen incidentes con el ID recibido...
            responseHandler.sendResponse(req, res, next, 400, 'Non-existent incident');
            return;
        }
        
        if(photos){ // Sube las fotos capturadas a la nube
            for(var photo of photos){
                // PENDIENTE Validar formato del archivo
                var origName = photo.originalname;
                var fileExt = origName.substring(origName.lastIndexOf('.'), origName.length);
                var filename = `${Date.now()}_${Math.round(Math.random() * 1E9)}` + fileExt;
                uploads.push(s3Util.uploadFile(filename, photosPrefix, photo.buffer));
            }
        }
        
        if(audio){ // Sube la grabación de audio a la nube
            // PENDIENTE validar que el archivo sea de audio
            var origName = audio[0].originalname;
            var fileExt = origName.substring(origName.lastIndexOf('.'), origName.length);
            uploads.push(s3Util.uploadFile(incidentId+fileExt, audioPrefix, audio[0].buffer));
        }

        Promise.allSettled(uploads).then(async(results) => {
            var sucPhotoUploads = []; // Lista de fotos subidas exitosamente

            results.forEach((result) => {

                if(result.status == 'fulfilled'){ // Si el archivo se subió exitosamente
                    var fileKey = result.value.key;

                    if(fileKey.substring(0, 6) === 'photos'){ // Si el archivo es una foto 
                        var photoData = { incident_id: incidentId, file: fileKey};
                        sucPhotoUploads.push(photoData);
                    }
                    else // Si el archivo es un audio
                        audioKey = fileKey;
                }
                else{ // Si ocurrió un error al subir el archivo
                    console.log(result.reason);
                }
            });

            if(sucPhotoUploads.length > 0){
                await incPhotoController.bulkCreate(sucPhotoUploads);
                evidenceSent = true;
                photosFolder = photosPrefix;
            }
            
            // Guarda la ubicación de las evidencias y actualiza el estado del incidente en BD
            incidentController.updateStatusF(incidentId, photosFolder, audioKey).then((updRes) => {
                var msg = 'Incident finished';
                if(evidenceSent && audioKey)
                    msg = msg + '. Visual and audio evidence uploaded.'
                else if(evidenceSent)
                msg = msg + '. Visual evidence uploaded.'

                responseHandler.sendResponse(req, res, next, 200, msg);
            })
            .catch((error) => { // Error al actualizar registro del incidente
                console.log(error);
                responseHandler.sendResponse(req, res, next, 500, 'Update record failed');
            });
        });
    })
    .catch((error) => {
        console.log(error);
        var resMsg = "Failed to retrieve record from database";
        responseHandler.sendResponse(req,res,next, 500, resMsg);
    });

});

// Servicio para subir el detalle de un incidente
router.post('/description', sessionUtils.validateSession, (req, res , next)=>{
    var userId = req.session.userId;

    // Valida los parámetros de entrada
    if(!req.body.incidentId || !req.body.description || !req.body.category){
        responseHandler.sendResponse(req, res, next, 400, 'Incorrect request parameters');
        return;
    }

    const incidentId = req.body.incidentId;
    const description = req.body.description;
    const categoryName = req.body.category;

    inCatController.getByName(categoryName).then((cat) => {
        var categoryId = 1; // Categoria default

        if(cat.length !== 0){ // Si se encontró la categoría guarda su ID
            categoryId = cat[0].id;
        }

        console.log(incidentId);
        console.log(description);
        console.log(categoryName);
        console.log(categoryId);

        incidentController.upldDescription(incidentId, description, categoryId).then((resUpdt) => {
            responseHandler.sendResponse(req,res,next, 200, 'Description successfully uploaded');
        }).catch((error) => {
            console.log(error)
            responseHandler.sendResponse(req,res,next, 500, 'Update record failed');
        });
        
    }).catch((error) => {
        console.log(error);
        var resMsg = "Failed to retrieve record from database";
        responseHandler.sendResponse(req,res,next, 500, resMsg);
    });

});


// Obtiene una lista de todos los reportes de incidentes a determinada distancia de la ubicación actual
router.post('/list', sessionUtils.validateSession, (req, res , next)=>{
    // PARAMETRIZAR
    const DISTANCE = 1; // Distancia máxima en km para latitud y longitud 
    const KMLATITUDE = 0.0089932; // Representación decimal de un kilometro en latitud
    var userId = req.session.userId;

    // Valida los parámetros de entrada
    if(!req.body.longitude || !req.body.latitude || isNaN(req.body.longitude) || isNaN(req.body.latitude)){
        responseHandler.sendResponse(req, res, next, 400, 'Incorrect request parameters');
        return;
    }
    var latitude = parseFloat(req.body.latitude);
    var longitude = parseFloat(req.body.longitude);

    // Predice el nivel de peligro
    var toPredict = [];
    const d = new Date();

    toPredict.push([latitude,longitude,d.getHours()]);
    var prediction = ann.predict(toPredict)[0];
    console.log(prediction);
    
    var predCat = prediction > 0.8 ? 2 : prediction > 0.5 ? 1 : 0;
    console.log(predCat) 

    // Obtiene los grados equivalentes a 1km para la latitud recibida
    var degreesPerKm = degreesPerKilometer(latitude); 

    // Se calculan las latitudes y longitudes máximas
    var maxLongEast = longitude+(degreesPerKm*DISTANCE);
    var maxLongWest = longitude-(degreesPerKm*DISTANCE);

    var maxLatNorth = latitude+(KMLATITUDE);
    var maxLatSouth = latitude-(KMLATITUDE);

    // Consulta reportes de incidentes recientes en el área
    incidentController.getIncidentsInArea(maxLatNorth, maxLatSouth, maxLongEast, maxLongWest).then((incidents)=>{
        if(incidents.length === 0){ // Si no se encontraron reportes...
            responseHandler.sendResponse(req,res,next, 200, {riskLevel: predCat});
            return;
        }
        
        var responseJson = {
            incidents: incidents,
            riskLevel: predCat
        }
        responseHandler.sendResponse(req,res,next, 200, responseJson);
    })
    .catch((error)=>{
        console.log(error);
        responseHandler.sendResponse(req,res,next, 500, 'Failed to retrieve records from database');
    });

});


// Obtiene una lista de todos los reportes de incidentes levantados por un usuario
router.get('/list', sessionUtils.validateSession, (req, res , next)=>{
    var userId = req.session.userId;

    // Consulta reportes de incidentes recientes en el área
    incidentController.getIncidentsByUser(userId).then((incidents)=>{
        if(incidents.length === 0){ // Si no se encontraron reportes
            responseHandler.sendResponse(req,res,next, 204, 'No reports of incidents found');
            return;
        }

        var sigUrlsProm = [];

        for(var incident of incidents){
            if(incident.photos_folder){ // URL firmada de las fotos
                sigUrlsProm.push(s3Util.getFiles(incident.id, incident.photos_folder));
            }
            if(incident.audio_file){ // URL firmada del audio
                incident.audioUrl = s3Util.getFile(incident.audio_file);
            }
        }

        Promise.allSettled(sigUrlsProm).then(async(sigUrlRes) => { // Obtiene las URL firmadas de las fotos evidencia

            sigUrlRes.forEach((result) => {
                if(result.status == 'fulfilled'){ // Si las URL se obtuvieron exitosamente
                    var incident = incidents.find(inc => inc.id === result.value.incidentId);
                    incident.photosUrls = result.value.urls;
                }
                else{ // Si ocurrió un error al obtener las URL
                    console.log(result.reason);
                }
            });
            
            // Guarda la ubicación de las evidencias y actualiza el estado del incidente en BD
            responseHandler.sendResponse(req,res,next, 200, incidents);
        });
    })
    .catch((error)=>{
        console.log(error);
        responseHandler.sendResponse(req,res,next, 500, 'Failed to retrieve records from database');
    });

});



function degreesPerKilometer(latitude) {
    const earthEquatorialRadius = 6378.137; // Radio ecuatorial medio de la Tierra en kilómetros
    // Convertir la latitud de grados a radianes
    const latRad = latitude * (Math.PI / 180);
    // Calcular la circunferencia de la Tierra en la latitud dada
    const circumferenceAtLatitude = 2 * Math.PI * earthEquatorialRadius * Math.cos(latRad);
    // Calcular cuántos grados de longitud corresponden a 1 km
    const degreesPerKm = 360 / circumferenceAtLatitude;
    return degreesPerKm;
}


module.exports = router;
