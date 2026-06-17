const asyncHandler = require('../utils/asyncHandler');
const profileService = require('../services/profile.service');
const { BadRequestError } = require('../utils/errors');

const getMeta = (req) => ({
  ip: req.ip,
  userAgent: req.headers['user-agent'],
});

/**
 * @route PATCH /api/v1/profile
 */
const updateProfile = asyncHandler(async (req, res) => {
  const { fullName, phoneNumber } = req.body;

  const user = await profileService.updateProfile(req.user._id, { fullName, phoneNumber }, getMeta(req));

  res.status(200).json({
    success: true,
    message: 'Profile updated successfully',
    data: { user: user.toJSON() },
  });
});

/**
 * @route POST /api/v1/profile/photo
 */
const uploadPhoto = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new BadRequestError('No photo file was uploaded');
  }

  const relativePath = `/uploads/profile-photos/${req.file.filename}`;
  const user = await profileService.updateProfilePhoto(req.user._id, relativePath, getMeta(req));

  res.status(200).json({
    success: true,
    message: 'Profile photo updated successfully',
    data: { user: user.toJSON() },
  });
});

module.exports = {
  updateProfile,
  uploadPhoto,
};
