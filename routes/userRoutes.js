const express = require('express');
const userController = require('../controllers/userController');
const authController = require('../controllers/authController');

// const upload = multer({ dest: 'public/img/users' });

const router = express.Router();

//no protect
router.post('/signup', authController.signup);
router.post('/login', authController.login);
//router.post('/forgot-password', authController.forgotPassword);
//router.patch('/reset-password/:token', authController.resetPassword);

//protect
router.use(authController.protectRoute);

//current user routes
//router.patch('/update-password', authController.updatePassword);

router
  .route('/me')
  .get(userController.getMe, userController.getUser)
  .patch(
    userController.uploadUserPhoto,
    userController.resizeUserPhoto,
    userController.updateMe
  )
  .delete(userController.deactivateMe);

//Admin-only

router
  .route('/')
  .get(userController.getAllUsers)
  .post(userController.createUser);

router
  .route('/users/:id')
  .get(userController.getUser)
  .patch(
    //userController.uploadUserPhoto,
    userController.updateUser
  )
  .delete(userController.deleteUser);

module.exports = router;
