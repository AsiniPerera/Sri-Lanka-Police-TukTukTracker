const mongoose = require('mongoose');

const districtSchema = new mongoose.Schema(
  {
    province_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Province',
      required: [true, 'Province reference is required'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'District name is required'],
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

// Compound unique: District names unique within a Province
districtSchema.index({ province_id: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('District', districtSchema);
