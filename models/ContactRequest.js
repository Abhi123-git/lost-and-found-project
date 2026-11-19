const mongoose = require('mongoose');
const contactRequestSchema = new mongoose.Schema({
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  message: { type: String, required: true, maxlength: 600, trim: true },
  status: { type: String, enum: ['new','reviewed','closed'], default: 'new' }
}, { timestamps: true });
module.exports = mongoose.model('ContactRequest', contactRequestSchema);
