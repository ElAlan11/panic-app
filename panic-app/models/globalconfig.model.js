'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class GlobalConfig extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  GlobalConfig.init({
    id: {
      allowNull: false,
      autoIncrement: true,
      primaryKey: true,
      type: DataTypes.INTEGER
    },
    parameter: {
      type: DataTypes.STRING(40),
      allowNull: false,
      unique: true
    },
    value: {
      type: DataTypes.STRING,
      allowNull: false
    },
    description: DataTypes.STRING,
    group: DataTypes.STRING(20)
  }, {
    sequelize,
    modelName: 'GlobalConfig',
    tableName: 'global_config'
  });
  return GlobalConfig;
};