const mongoose = require('mongoose');
const { NIC_REGEX, PHONE_REGEX } = require('../config/constants');

const driverSchema = new mongoose.Schema(
  {
    nic_number: {
      type: String,
      required: [true, 'NIC number is required'],
      unique: true,
      uppercase: true,
      trim: true,
      match: [NIC_REGEX, 'Invalid Sri Lankan NIC number'],
      index: true,
    },
    full_name: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
    },
    phone_number: {
      type: String,
      required: [true, 'Phone number is required'],
      match: [PHONE_REGEX, 'Invalid Sri Lankan phone number'],
    },
    current_vehicle_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vehicle',
      default: null,
      index: true,
    },
    device_id: {
      type: String,
      required: [true, 'Hardware device ID is required'],
      unique: true,
      uppercase: true,
      trim: true,
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

driverSchema.index({ full_name: 'text' });

module.exports = mongoose.model('Driver', driverSchema);
