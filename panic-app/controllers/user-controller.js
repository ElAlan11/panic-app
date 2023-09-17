const Sequelize = require('sequelize');
const User = require('../models').User;

module.exports = {

    getUserByEmail(reqEmail){
        return User.findAll({
            attributes: ['id', 'email', 'password'],
            where: {
                email: reqEmail,
                disabled: false
            }
        })
    },
    create(req, res) {
        return User
            .create({
                email: req.body.email,
                password: req.body.password,
                firstname: req.body.firstname,
                lastname: req.body.lastname,
                birthday: req.body.birthday,
                phone: req.body.phone
            });
    },

};