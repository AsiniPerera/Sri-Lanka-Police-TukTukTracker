const mongoose = require('mongoose');
const { PHONE_REGEX } = require('../config/constants');

const policeStationSchema = new mongoose.Schema(
  {
    district_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'District',
      required: [true, 'District reference is required'],
      index: true,
    },
    station_name: {
      type: String,
      required: [true, 'Station name is required'],
      trim: true,
    },
    station_code: {
      type: String,
      required: [true, 'Station code is required'],
      unique: true,
      uppercase: true,
      trim: true,
    },
    contact_number: {
      type: String,
      required: [true, 'Contact number is required'],
      match: [PHONE_REGEX, 'Invalid Sri Lankan phone number'],
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

policeStationSchema.index({ station_name: 'text' });

module.exports = mongoose.model('PoliceStation', policeStationSchema);
