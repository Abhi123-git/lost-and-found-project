const mongoose = require('mongoose');
const itemSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, required: true, trim: true, maxlength: 1500 },
  category: { type: String, required: true, enum: ['Electronics','Documents','Accessories','Clothing','Bags','Keys','Other'] },
  type: { type: String, required: true, enum: ['lost','found'] },
  location: { type: String, required: true, trim: true, maxlength: 120 },
  incidentDate: { type: Date, required: true },
  image: { type: String, default: '' },
  status: { type: String, enum: ['active','returned'], default: 'active' },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });
itemSchema.index({ title: 'text', description: 'text', location: 'text' });
module.exports = mongoose.model('Item', itemSchema);
