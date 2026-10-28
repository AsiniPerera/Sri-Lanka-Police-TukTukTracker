const mongoose = require('mongoose');

const liveStatusSchema = new mongoose.Schema(
  {
    vehicle_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vehicle',
      required: true,
      unique: true,
      index: true,
    },
    last_ping_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LocationPing',
    },
    latitude: {
      type: Number,
      required: true,
    },
    longitude: {
      type: Number,
      required: true,
    },
    speed: { type: Number, default: 0 },
    heading: { type: Number, default: 0 },
    last_updated: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    current_district_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'District',
      index: true,
    },
    current_province_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Province',
      index: true,
    },
    is_online: {
      type: Boolean,
      default: true,
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

module.exports = mongoose.model('LiveStatus', liveStatusSchema);
