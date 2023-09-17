const Sequelize = require('sequelize');
const IncidentPhoto = require('../models').IncidentPhoto;

module.exports = {
    //Crea un nuevo registro de foto de incidente
    create(incidentId, fileKey) {
        return IncidentPhoto
            .create({
                incident_id: incidentId,
                file: fileKey,
            });
    },
    //Crea nuevos registros en lote
    bulkCreate(photos) {
        return IncidentPhoto
            .bulkCreate(photos);
    },
    
};