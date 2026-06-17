const express = require('express');
const profileController = require('../../controllers/profile.controller');
const { protectCustomer } = require('../../middleware/auth');
const { uploadProfilePhoto } = require('../../middleware/upload');
const validate = require('../../middleware/validate');
const { updateProfileValidator } = require('../../validators/profile.validator');

const router = express.Router();

router.use(protectCustomer);

router.patch('/', updateProfileValidator, validate, profileController.updateProfile);
router.post('/photo', uploadProfilePhoto, profileController.uploadPhoto);

module.exports = router;
