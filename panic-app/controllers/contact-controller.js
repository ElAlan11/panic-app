const Sequelize = require('sequelize');
const Contact = require('../models').Contact;

module.exports = {
    // Obtiene los contactos de confianza relacionados a un usuario
    getTrustedContacts(userId){
        return Contact.findAll({
            attributes: ['name', 'phone'],
            where: {
                user_id: userId
            }
        })
    },
    //Crea un nuevo contacto de confianza y lo asocia a un usuario
    create(reqData, userId) {
        return Contact
            .create({
                user_id: userId,
                name: reqData.contactName,
                phone: reqData.contactPhone
            });
    },
    // Actualiza el SNS Topic del contacto
    updateSNSTopic(contactId, snsTopic){
        return Contact
            .update({ 
                sms_topic: snsTopic
            }, {
                where: { id: contactId }
            });
    },
    // Busca un contacto por número telefónico y ID usuario
    getContact(userId, phone){
        return Contact.findAll({
            where: {
                user_id: userId,
                phone: phone
            }
        })
    },

};