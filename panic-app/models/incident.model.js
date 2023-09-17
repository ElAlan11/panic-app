'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Incident extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
      Incident.belongsTo(models.User,
        {
            as: 'user',
            foreignKey: 'user_id',
        }
      );
      Incident.belongsTo(models.IncidentCategory,
        {
            foreignKey: 'category'
        }
      );
      Incident.hasMany(models.IncidentPhoto, {
        foreignKey: 'incident_id'
      });
    }
  }
  Incident.init({
    id: {
      allowNull: false,
      primaryKey: true,
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    latitude: DataTypes.FLOAT(8,5),
    longitude: DataTypes.FLOAT(8,5),
    initial_latitude: DataTypes.FLOAT(8,5),
    initial_longitude: DataTypes.FLOAT(8,5),
    audio_file: DataTypes.STRING,
    photos_folder: DataTypes.STRING,
    description: DataTypes.STRING,
    category: DataTypes.INTEGER,
    finished: DataTypes.BOOLEAN 
  }, {
    sequelize,
    modelName: 'Incident',
    tableName: 'incidents'
  });
  return Incident;
};