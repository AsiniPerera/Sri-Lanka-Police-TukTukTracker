const mongoose = require('mongoose');
const { VEHICLE_STATUS, LICENSE_PLATE_REGEX, NIC_REGEX } = require('../config/constants');

const vehicleSchema = new mongoose.Schema(
  {
    license_plate: {
      type: String,
      required: [true, 'License plate is required'],
      unique: true,
      uppercase: true,
      trim: true,
      match: [LICENSE_PLATE_REGEX, 'Invalid Sri Lankan license plate format'],
      index: true,
    },
    chassis_number: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    engine_number: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    owner_name: {
      type: String,
      required: true,
      trim: true,
    },
    owner_nic: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      match: [NIC_REGEX, 'Invalid Sri Lankan NIC number'],
      index: true,
    },
    station_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PoliceStation',
      required: [true, 'Registered police station is required'],
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(VEHICLE_STATUS),
      default: VEHICLE_STATUS.REGISTERED,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

vehicleSchema.index({ owner_name: 'text' });

module.exports = mongoose.model('Vehicle', vehicleSchema);
