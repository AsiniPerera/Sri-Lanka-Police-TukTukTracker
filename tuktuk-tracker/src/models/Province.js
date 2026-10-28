const mongoose = require('mongoose');

const provinceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Province name is required'],
      unique: true,
      trim: true,
    },
    code: {
      type: String,
      required: [true, 'Province code is required'],
      unique: true,
      uppercase: true,
      trim: true,
      minlength: 2,
      maxlength: 2,
      match: [/^[A-Z]{2}$/, 'Province code must be 2 uppercase letters'],
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

module.exports = mongoose.model('Province', provinceSchema);
