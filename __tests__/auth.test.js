const User = require('../models/user.model');
const RefreshToken = require('../models/refresh-token.model');
const Email = require('../services/email.service');
const { mockUsers } = require('../test/mock-data/mockData');
const {
  clearTestMailbox,
  getTestEmails,
} = require('../test/helpers/emailHelpers');
const { createUserAndLogin } = require('../test/helpers/authHelpers');
const testApp = require('../test/testApp');

describe('Authorization', () => {
  describe('signing up', () => {
    beforeAll(async () => {
      await clearTestMailbox();
    });

    afterAll(async () => {
      await clearTestMailbox();
    });

    it('signs up a user, hashes password, returns user object and token', async () => {
      const signUpMailer = jest.spyOn(Email.prototype, 'sendWelcome');
      const { name, email, password, passwordConfirm } = mockUsers(1);

      const testUser = { name, email, password, passwordConfirm };

      const response = await testApp().post('/api/users/signup').send(testUser);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('token');
      expect(response.body.data.user.name).toBe(name);
      expect(response.body.data.user.email).toBe(email);
      expect(response.body.data.user.password).toBeUndefined();
      expect(response.body.data.user.passwordConfirm).toBeUndefined();

      //assert cookie
      expect(response.header['set-cookie'][0]).toContain('refreshToken');

      //assert password hashed
      expect(signUpMailer).toHaveBeenCalled();
      const user = await User.findOne({ email });
      expect(user.password).not.toBe(password);
      expect(user.passwordConfirm).toBeUndefined();

      //assert email
      const testEmails = await getTestEmails();
      expect(testEmails.length).toBe(1);
    });

    it('returns 400 for password and confirmation mismatch', async () => {
      const { name, email, password, passwordConfirm } = mockUsers(1, {
        overrides: { passwordConfirm: 'wrong' },
      });

      const response = await testApp()
        .post('/api/users/signup')
        .send({ name, email, password, passwordConfirm });

      expect(response.status).toBe(400);
      expect(response.body.message).toEqual(expect.stringMatching(/match/i));
    });

    it('returns 400 for invalid email', async () => {
      const { name, email, password, passwordConfirm } = mockUsers(1, {
        overrides: { email: 'invalid' },
      });

      const response = await testApp()
        .post('/api/users/signup')
        .send({ name, email, password, passwordConfirm });

      expect(response.status).toBe(400);
      expect(response.body.message).toEqual(expect.stringMatching(/email/i));
    });

    it('returns 400 for invalid password', async () => {
      const { name, email, password, passwordConfirm } = mockUsers(1, {
        overrides: { password: 'invalid', passwordConfirm: 'invalid' },
      });

      const response = await testApp()
        .post('/api/users/signup')
        .send({ name, email, password, passwordConfirm });

      expect(response.status).toBe(400);
      expect(response.body.message).toEqual(expect.stringMatching(/password/i));
    });

    it('returns 400 for invalid name', async () => {
      const { name, email, password, passwordConfirm } = mockUsers(1, {
        overrides: {
          name: 'really long invalid name that is also way too long',
        },
      });

      const response = await testApp()
        .post('/api/users/signup')
        .send({ name, email, password, passwordConfirm });

      expect(response.status).toBe(400);
      expect(response.body.message).toEqual(expect.stringMatching(/name/i));
    });

    const missingFieldsTestData = [
      { overrides: { name: undefined }, missingField: 'name' },
      { overrides: { email: undefined }, missingField: 'email' },
      { overrides: { password: undefined }, missingField: 'password' },
      {
        overrides: { passwordConfirm: undefined },
        missingField: 'confirm',
      },
    ];

    it.each(missingFieldsTestData)(
      'returns 400 for missing field: $missingField',
      async ({ overrides, missingField }) => {
        const { name, email, password, passwordConfirm } = mockUsers(1, {
          overrides,
        });

        const response = await testApp()
          .post('/api/users/signup')
          .send({ name, email, password, passwordConfirm });

        expect(response.status).toBe(400);
        expect(response.body.message).toEqual(
          expect.stringMatching(new RegExp(missingField, 'i'))
        );
      }
    );
  });

  describe('signing in', () => {
    it('signs in existing user, returns token and user object', async () => {
      const { name, email, password, passwordConfirm } = mockUsers(1);
      await User.create({
        name,
        email,
        password,
        passwordConfirm,
      });

      const response = await testApp().post('/api/users/signin').send({
        email,
        password,
      });

      expect(response.header['set-cookie'][0]).toContain('refreshToken');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
      expect(response.body.data.user.name).toBe(name);
      expect(response.body.data.user.email).toBe(email);
      expect(response.body.data.user.password).toBeUndefined();
      expect(response.body.data.user.passwordConfirm).toBeUndefined();
    });

    it('returns 400 for missing email or password in body', async () => {
      const { name, email, password, passwordConfirm } = mockUsers(1);
      await User.create({
        name,
        email,
        password,
        passwordConfirm,
      });

      const response = await testApp().post('/api/users/signin').send({
        email,
        password: undefined,
      });

      expect(response.status).toBe(400);
      expect(response.body.message).toEqual(expect.stringMatching(/password/i));

      const response2 = await testApp().post('/api/users/signin').send({
        email: undefined,
        password,
      });

      expect(response2.status).toBe(400);
      expect(response2.body.message).toEqual(expect.stringMatching(/email/i));
    });

    it('returns 400 for wrong password', async () => {
      const { name, email, password, passwordConfirm } = mockUsers(1);
      await User.create({
        name,
        email,
        password,
        passwordConfirm,
      });

      const response = await testApp().post('/api/users/signin').send({
        email,
        password: 'wrong',
      });

      expect(response.status).toBe(400);
      expect(response.body.message).toEqual(expect.stringMatching(/password/i));
    });

    it('returns 400 for no user with matching email', async () => {
      const response = await testApp().post('/api/users/signin').send({
        email: 'notauser@test.test',
        password: 'password',
      });

      expect(response.status).toBe(400);
      expect(response.body.message).toEqual(
        expect.stringMatching(/does not exist/i)
      );
    });
  });

  describe('refresh token', () => {
    it('refreshes token for user with valid refresh token in cookie, returns new JWT, refreshToken, and user info', async () => {
      const { user, refreshToken, token } = await createUserAndLogin();

      const response = await testApp()
        .get('/api/users/refresh-token')
        .set('Cookie', [`refreshToken=${refreshToken}`]);

      expect(response.status).toBe(200);

      //RefreshToken
      expect(response.header['set-cookie'][0]).toContain('refreshToken');
      expect(response.header['set-cookie'][0]).not.toEqual(refreshToken);

      //JWT
      expect(response.body.token).toBeDefined();
      expect(response.body.token).not.toEqual(token);

      //User
      expect(response.body.data.user.email).toBe(user.email);
    });

    it('returns 401 for invalid refresh token', async () => {
      const response = await testApp()
        .get('/api/users/refresh-token')
        .set('Cookie', [`refreshToken=invalid`]);

      expect(response.status).toBe(401);
      expect(response.body.message).toEqual(
        expect.stringMatching(/invalid token/i)
      );
    });

    it('returns 400 for no refresh token', async () => {
      const response = await testApp().get('/api/users/refresh-token');

      expect(response.status).toBe(400);
      expect(response.body.message).toEqual(
        expect.stringMatching(/refresh token/i)
      );
    });

    it('returns 401 for expired token', async () => {
      const { refreshToken } = await createUserAndLogin();

      //Set refresh token to expire
      await RefreshToken.findOneAndUpdate(
        { token: refreshToken },
        { expires: new Date(Date.now() - 100000) }
      );

      const response = await testApp()
        .get('/api/users/refresh-token')
        .set('Cookie', [`refreshToken=${refreshToken}`]);

      expect(response.status).toBe(401);
      expect(response.body.message).toEqual(
        expect.stringMatching(/invalid token/i)
      );
    });
  });

  describe('forgot password', () => {
    beforeAll(async () => {
      await clearTestMailbox();
      jest.resetAllMocks();
    });

    afterAll(async () => {
      await clearTestMailbox();
      jest.resetAllMocks();
    });

    it('creates password reset token and sends email', async () => {
      const passwordResetMailer = jest.spyOn(
        Email.prototype,
        'sendPasswordReset'
      );

      const { email, _id } = await User.create(mockUsers(1));

      const response = await testApp().post('/api/users/forgot-password').send({
        email,
      });
      expect(response.status).toBe(200);
      expect(response.body.message).toEqual(
        expect.stringMatching(/email sent/i)
      );

      //assert reset token created
      const userDoc = await User.findById(_id);

      expect(userDoc.passwordResetToken).toBeTruthy();
      expect(userDoc.passwordResetExpires).toBeDefined();

      //get email
      expect(passwordResetMailer).toHaveBeenCalled();
      const testMail = await getTestEmails();
      expect(testMail.length).toBe(1);
      expect(testMail[0].to_email).toBe(email);
    });

    it('returns 500 and deletes reset token on email failure', async () => {
      //mock mailer to fail
      jest
        .spyOn(Email.prototype, 'sendPasswordReset')
        .mockImplementation(() => {
          throw new Error('test error');
        });

      const { email, _id } = await User.create(mockUsers(1));

      const response = await testApp().post('/api/users/forgot-password').send({
        email,
      });

      expect(response.status).toBe(500);
      expect(response.body.message).toEqual(expect.stringMatching(/email/i));

      //assert reset token deleted
      const userDoc = await User.findById(_id);
      expect(userDoc.passwordResetToken).toBeUndefined();
      expect(userDoc.passwordResetExpires).toBeUndefined();
    });

    it('returns 404 for no user', async () => {
      const response = await testApp().post('/api/users/forgot-password').send({
        email: 'notanaccount@test.test',
      });

      expect(response.status).toBe(404);
    });

    it('returns 404 for inactive user', async () => {
      const { email } = await User.create(
        mockUsers(1, { overrides: { active: false } })
      );

      const response = await testApp().post('/api/users/forgot-password').send({
        email,
      });

      expect(response.status).toBe(404);
      expect(response.body.message).toEqual(expect.stringMatching(/active/i));
    });

    it('returns 400 for no email', async () => {
      const response = await testApp().post('/api/users/forgot-password');

      expect(response.status).toBe(400);
      expect(response.body.message).toEqual(
        expect.stringMatching(/provide an email/i)
      );
    });

    it('allows password reset with token', async () => {
      const mockUser = mockUsers(1);
      const testUser = await User.create(mockUser);

      const resetToken = testUser.createPasswordResetToken();
      await testUser.save({ validateBeforeSave: false });

      const response = await testApp()
        .patch(`/api/users/reset-password/${resetToken}`)
        .send({
          password: 'newpassword',
          passwordConfirm: 'newpassword',
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toEqual(
        expect.stringMatching(/password changed/i)
      );

      //assert password changed
      const userDoc = await User.findById(testUser._id).select('+password');
      const isPasswordCorrect = await userDoc.isCorrectPassword(
        mockUser.password,
        userDoc.password
      );
      expect(isPasswordCorrect).toBe(false);
      expect(userDoc.passwordConfirm).toBeUndefined();
      expect(userDoc.passwordResetToken).toBeUndefined();
      expect(userDoc.passwordResetExpires).toBeUndefined();
    });

    it('returns 400 for invalid token', async () => {
      const response = await testApp().patch(
        '/api/users/reset-password/invalid'
      );

      expect(response.status).toBe(400);
      expect(response.body.message).toEqual(expect.stringMatching(/invalid/i));
    });

    it('returns 400 for expired token', async () => {
      const mockUser = mockUsers(1);
      const testUser = await User.create(mockUser);

      const resetToken = testUser.createPasswordResetToken();
      await testUser.save({ validateBeforeSave: false });

      //Set reset token to expire
      await User.findOneAndUpdate({
        passwordResetExpires: new Date(Date.now() - 100000),
      });

      const response = await testApp()
        .patch(`/api/users/reset-password/${resetToken}`)
        .send({
          password: 'newpassword',
          passwordConfirm: 'newpassword',
        });

      expect(response.status).toBe(400);
    });

    const passwordResetInvalidData = [
      {
        body: { password: 'newpassword' },
        missing: 'confirm',
      },
      {
        body: { passwordConfirm: 'newpassword' },
        missing: 'password',
      },
    ];

    it.each(passwordResetInvalidData)(
      'returns 400 for missing field: $missing',
      async ({ body, missing }) => {
        const mockUser = mockUsers(1);
        const testUser = await User.create(mockUser);

        const resetToken = testUser.createPasswordResetToken();
        await testUser.save({ validateBeforeSave: false });

        const response = await testApp()
          .patch(`/api/users/reset-password/${resetToken}`)
          .send(body);

        expect(response.body.message).toEqual(
          expect.stringMatching(new RegExp(missing, 'i'))
        );
      }
    );

    it('returns 400 for password and passwordConfirm not matching', async () => {
      const mockUser = mockUsers(1);
      const testUser = await User.create(mockUser);

      const resetToken = testUser.createPasswordResetToken();
      await testUser.save({ validateBeforeSave: false });

      const response = await testApp()
        .patch(`/api/users/reset-password/${resetToken}`)
        .send({
          password: 'newpassword',
          passwordConfirm: 'newpassword2',
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toEqual(expect.stringMatching(/match/i));
    });
  });
});
