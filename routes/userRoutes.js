const express = require('express');
//Controllers

const router = express.Router();

//no protect
router.post('/signup', authController.signup);
router.post('/login', authController.login);
router.post('/forgot-password', authController.forgotPassword);
router.patch('/reset-password/:token', authController.resetPassword);

//protect

//current user routes
router.patch('/update-password', authController.updatePassword);

router
  .route('/me')
  .get(userController.getCurrentUser, userController.getUser)
  .patch(userController.updateCurrentUser)
  .delete(userController.deactivateCurrentUser);

//Admin-only

router
  .route('/')
  .get(userController.getAllUsers)
  .create(userController.createUser);

router
  .route('/users/:id')
  .get(userController.getUser)
  .patch(userController.updateUser)
  .delete(userController.deleteUser);
