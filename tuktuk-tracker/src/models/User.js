const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { ROLE_LIST, USER_STATUS } = require('../config/constants');

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      lowercase: true,
      trim: true,
      minlength: 3,
      maxlength: 50,
    },
    password_hash: {
      type: String,
      required: false,
      select: false,
    },
    full_name: {
      type: String,
      trim: true,
    },
    /**
     * Asgardeo's `sub` claim — the stable link between the external identity
     * and this record. Set on an officer's first Asgardeo sign-in; absent until
     * then, which is the normal state for a freshly provisioned officer.
     *
     * Deliberately has NO `default: null`, and its unique index is declared
     * below as a partial index rather than inline. A `sparse` unique index only
     * skips documents where the field is *absent* — an explicit null is still
     * indexed — so defaulting to null puts every not-yet-linked officer into
     * the index and the second one fails with E11000.
     */
    asgardeo_sub: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      default: null,
    },
    role: {
      type: String,
      enum: {
        values: ROLE_LIST,
        message: '{VALUE} is not a valid role',
      },
      required: [true, 'Role is required'],
      index: true,
    },
    scope_id: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(USER_STATUS),
      default: USER_STATUS.ACTIVE,
    },
    last_login: {
      type: Date,
      default: null,
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
        delete ret.password_hash;
        return ret;
      },
    },
  }
);

/**
 * Unique only among officers that actually carry an Asgardeo sub.
 *
 * partialFilterExpression is used instead of `sparse` because it keys off the
 * value's type: documents where asgardeo_sub is absent *or* null are both left
 * out of the index, so any number of unlinked officers can coexist while a
 * given external identity still cannot be linked to two records.
 */
userSchema.index(
  { asgardeo_sub: 1 },
  { unique: true, partialFilterExpression: { asgardeo_sub: { $type: 'string' } } }
);

userSchema.pre('save', async function (next) {
  if (this._plainPassword) {
    const salt = await bcrypt.genSalt(10);
    this.password_hash = await bcrypt.hash(this._plainPassword, salt);
    this._plainPassword = undefined;
  }
  next();
});

userSchema.virtual('password').set(function (plain) {
  this._plainPassword = plain;
});

userSchema.methods.comparePassword = async function (candidate) {
  if (!this.password_hash) return false;
  return bcrypt.compare(candidate, this.password_hash);
};

module.exports = mongoose.model('User', userSchema);