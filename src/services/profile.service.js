const path = require('path');
const fs = require('fs');
const User = require('../models/User');
const { recordAuditLog } = require('./auditLog.service');
const { NotFoundError, BadRequestError } = require('../utils/errors');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'profile-photos');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/**
 * Updates editable profile fields for a user (full name, phone number).
 * Email/username changes are intentionally not allowed here since they
 * are tied to identity/verification - those would go through a separate,
 * more controlled flow.
 */
const updateProfile = async (userId, updates, meta = {}) => {
  const allowedFields = ['fullName', 'phoneNumber'];
  const sanitizedUpdates = {};

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      sanitizedUpdates[field] = updates[field];
    }
  }

  if (Object.keys(sanitizedUpdates).length === 0) {
    throw new BadRequestError('No valid fields provided to update');
  }

  const user = await User.findByIdAndUpdate(userId, sanitizedUpdates, {
    new: true,
    runValidators: true,
  });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  await recordAuditLog({
    actorType: 'user',
    actorId: user._id,
    actorLabel: user.email,
    action: 'PROFILE_UPDATED',
    targetType: 'User',
    targetId: user._id,
    description: 'User updated profile information',
    metadata: { updatedFields: Object.keys(sanitizedUpdates) },
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
  });

  return user;
};

/**
 * Saves a new profile photo path for the user.
 * The actual file write is handled by the controller (multer); this
 * function just persists the relative path and removes the old file.
 */
const updateProfilePhoto = async (userId, relativePath, meta = {}) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  const oldPhoto = user.profilePhoto;

  user.profilePhoto = relativePath;
  await user.save({ validateBeforeSave: false });

  // Remove old photo file if it exists and is a local upload
  if (oldPhoto && oldPhoto.startsWith('/uploads/')) {
    const oldFilePath = path.join(__dirname, '..', '..', oldPhoto.replace('/uploads/', 'uploads/'));
    fs.unlink(oldFilePath, () => {
      /* ignore errors - file may not exist */
    });
  }

  await recordAuditLog({
    actorType: 'user',
    actorId: user._id,
    actorLabel: user.email,
    action: 'PROFILE_PHOTO_UPDATED',
    targetType: 'User',
    targetId: user._id,
    description: 'User updated profile photo',
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
  });

  return user;
};

module.exports = {
  updateProfile,
  updateProfilePhoto,
  UPLOAD_DIR,
};
