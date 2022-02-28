const mongoose = require('mongoose');
const { S3 } = require('aws-sdk');
const User = require('../models/user.model');
const { mockUsers, mockEvents } = require('../test/mock-data/mockData');
const { setupEvents, setupUsers } = require('../test/helpers/dbHelpers');
const {
  createUserAndLogin,
  createAdminAndLogin,
} = require('../test/helpers/authHelpers');
const testApp = require('../test/testApp');
const pick = require('../test/helpers/pick');

describe('Users', () => {
  describe('getting public profile', () => {
    it('returns 200 and user profile data with populated events', async () => {
      //create favorited events
      const favoriteEvents = mockEvents(2);
      const { insertedIds } = await setupEvents(favoriteEvents);
      const favoriteIds = Object.values(insertedIds).map((id) => id.toString());

      //create user
      const mockUser = mockUsers(1, {
        overrides: { privateFavorites: false, favorites: favoriteIds },
      });
      const testUser = await User.create(mockUser);

      //create user organized event
      await setupEvents(
        mockEvents(1, {
          overrides: { organizer: testUser.id },
        })
      );

      //get user profile
      const response = await testApp().get(
        `/api/users/profile/${testUser._id}`
      );

      //expected fields other than favorites and events
      const expectedUserFields = [
        'name',
        'photo',
        'createdAt',
        'tagline',
        'bio',
        'interests',
      ];
      const expectedUserData = pick(testUser, ...expectedUserFields);
      expectedUserData.createdAt = expectedUserData.createdAt.toISOString(); //convert date to string

      expect(response.status).toBe(200);
      expect(response.body.data.user).toMatchObject(expectedUserData);

      const expectedEventFields = {
        id: expect.any(String),
        name: expect.any(String),
        dateTimeStart: expect.any(String),
        dateTimeEnd: expect.any(String),
        photo: expect.any(String),
        ticketTiers: expect.any(Array),
        totalBookings: expect.any(Number),
      };

      //assert populated favorites and events
      const { favorites, events } = response.body.data.user;
      expect(favorites).toHaveLength(2);
      for (let i; i < favorites.length; ++i) {
        expect(favorites[i]).toMatchObject(expectedEventFields);
      }
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject(expectedEventFields);
    });

    it('limits selected fields to subset of default fields', async () => {
      //create user
      const mockUser = mockUsers(1, {
        overrides: { privateFavorites: false },
      });
      const testUser = await User.create(mockUser);

      //create user organized event
      await setupEvents(
        mockEvents(1, {
          overrides: { organizer: testUser.id },
        })
      );

      //get user profile
      const response = await testApp().get(
        `/api/users/profile/${testUser._id}?fields=name,createdAt,photo,password,email`
      );

      //expected no password or email
      const { user } = response.body.data;
      expect(response.status).toBe(200);
      expect(user.password).toBeUndefined();
      expect(user.email).toBeUndefined();
    });

    it('paginates events and favorites', async () => {
      //create favorited events
      const favoriteEvents = mockEvents(2);
      const { insertedIds } = await setupEvents(favoriteEvents);
      const favoriteIds = Object.values(insertedIds).map((id) => id.toString());

      //create user
      const mockUser = mockUsers(1, {
        overrides: { privateFavorites: false, favorites: favoriteIds },
      });
      const testUser = await User.create(mockUser);

      //create user organized events
      await setupEvents(
        mockEvents(2, [
          {
            overrides: { organizer: testUser.id },
          },
          {
            overrides: { organizer: testUser.id },
          },
        ])
      );

      //get user profile, paginate favorites and events
      const response = await testApp().get(
        `/api/users/profile/${testUser._id}?paginate[page]=1&paginate[limit]=1`
      );

      //expect paginated
      expect(response.status).toBe(200);
      expect(response.body.data.user.favorites).toHaveLength(1);
      expect(response.body.data.user.events).toHaveLength(1);
    });

    it('does not return favorites when private', async () => {
      const favoritedEvent = await setupEvents(mockEvents(1));
      const testUser = await User.create(
        mockUsers(1, {
          overrides: { privateFavorites: true, favorites: [favoritedEvent.id] },
        })
      );

      const response = await testApp().get(
        `/api/users/profile/${testUser._id}`
      );

      expect(response.status).toBe(200);
      expect(response.body.data.user.favorites).toBeUndefined();
    });

    it('returns 404 for no user', async () => {
      const fakeUserId = mongoose.Types.ObjectId();
      const response = await testApp().get(`/api/users/profile/${fakeUserId}`);

      expect(response.status).toBe(404);
    });

    it('returns 404 for inactive user', async () => {
      const testUser = await User.create(
        mockUsers(1, { overrides: { active: false } })
      );

      const response = await testApp().get(
        `/api/users/profile/${testUser._id}`
      );
      expect(response.status).toBe(404);
    });
  });

  describe('getting current user', () => {
    it(' returns logged in user document of logged in user', async () => {
      const { token, user } = await createUserAndLogin();

      const expectedUserObject = { ...user };
      delete expectedUserObject.password;
      delete expectedUserObject.__v;

      const response = await testApp()
        .get('/api/users/me')
        .auth(token, { type: 'bearer' });

      expect(response.status).toBe(200);
      expect(response.body.data.data).toMatchObject(expectedUserObject);
    });

    it('returns 401 for guest', async () => {
      const response = await testApp().get('/api/users/me');
      expect(response.status).toBe(401);
    });
  });

  describe('updating current user', () => {
    it('updates and returns user document for logged in user', async () => {
      const { token, user } = await createUserAndLogin();

      const newUser = {
        name: 'New Name',
        email: 'newemail@test.com',
        tagline: 'New Tagline',
        bio: 'New Bio',
        interests: 'new interests',
        privateFavorites: !user.privateFavorites,
        favorites: [String(mongoose.Types.ObjectId())],
      };

      const response = await testApp()
        .patch('/api/users/me')
        .send(newUser)
        .auth(token, { type: 'bearer' });

      expect(response.status).toBe(200);
      expect(response.body.data.data).toMatchObject(newUser);
    });

    it('filters prohibited fields', async () => {
      const { token } = await createUserAndLogin();

      const response = await testApp()
        .patch('/api/users/me')
        .send({
          role: 'admin',
          active: false,
          passwordChangedAt: new Date('2020-01-01'),
          passwordResetToken: 'token',
          passwordResetExpires: new Date('2020-01-02'),
        })
        .auth(token, { type: 'bearer' });

      expect(response.status).toBe(200);
      const { data } = response.body.data;
      expect(data.role).toBe('user');
      expect(data.active).toBe(true);
      expect(data.passwordChangedAt).toBeUndefined();
      expect(data.passwordResetToken).toBeUndefined();
      expect(data.passwordResetExpires).toBeUndefined();
    });

    it('returns 400 when attempting to change password', async () => {
      const { token } = await createUserAndLogin();

      const response = await testApp()
        .patch('/api/users/me')
        .send({ password: 'newpassword', passwordConfirm: 'newpassword' })
        .auth(token, { type: 'bearer' });

      expect(response.status).toBe(400);
      expect(response.body.message).toEqual(expect.stringMatching(/password/i));
    });

    it('updates user photo', async () => {
      const mockPutObject = jest.spyOn(S3.prototype, 'putObject');
      const { token, user } = await createUserAndLogin();

      expect(user.photo).toBe('default.jpeg');

      const response = await testApp()
        .patch('/api/users/me')
        .attach('photo', './test/mock-data/test-image.jpg')
        .auth(token, { type: 'bearer' });

      expect(mockPutObject).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: `users/${user._id}.jpeg`,
        Body: expect.any(Buffer),
      });

      expect(response.status).toBe(200);
      expect(response.body.data.data.photo).toBe(`${user._id}.jpeg`);
    });

    it('ignores updating photo filename with no file present', async () => {
      const { token, user } = await createUserAndLogin();

      expect(user.photo).toBe('default.jpeg');

      const response = await testApp()
        .patch('/api/users/me')
        .send({ photo: 'new-photo.jpeg' })
        .auth(token, { type: 'bearer' });

      expect(response.status).toBe(200);
      expect(response.body.data.data.photo).toBe('default.jpeg');
    });

    it('returns 400 for form data with file in wrong field', async () => {
      const { token } = await createUserAndLogin();

      const response = await testApp()
        .patch('/api/users/me')
        .attach('image', './test/mock-data/test-image.jpg')
        .auth(token, { type: 'bearer' });

      expect(response.status).toBe(400);
      expect(response.body.message).toEqual(expect.stringMatching(/field/i));
    });

    it('returns 400 when file not image', async () => {
      const { token } = await createUserAndLogin();

      const response = await testApp()
        .patch('/api/users/me')
        .attach('photo', './test/mock-data/not-image.txt')
        .auth(token, { type: 'bearer' });

      expect(response.status).toBe(400);
      expect(response.body.message).toEqual(expect.stringMatching(/image/i));
    });

    it('returns 401 for guest', async () => {
      const response = await testApp().patch('/api/users/me');

      expect(response.status).toBe(401);
    });
  });

  describe('deactivating current user', () => {
    it('active logged in user can deactivate account', async () => {
      const { token, user } = await createUserAndLogin();

      const response = await testApp()
        .delete('/api/users/me')
        .auth(token, { type: 'bearer' });

      expect(response.status).toBe(204);

      //assert inactive
      const updatedUser = await User.findById(user._id);
      expect(updatedUser.active).toBe(false);
    });

    it('returns 401 for guest', async () => {
      const response = await testApp().delete('/api/users/me');

      expect(response.status).toBe(401);
    });
  });

  describe('admin-only actions', () => {
    const attemptRouteAsUser = async (method, route, body) => async () => {
      const { token } = await createUserAndLogin();

      const request = testApp()[method](route).auth(token, { type: 'bearer' });
      if (body) {
        request.send(body);
      }

      const response = await request;
      expect(response.status).toBe(403);
    };

    describe('getting all users', () => {
      it('returns all users, active and inactive, to admin', async () => {
        //create users
        await setupUsers(mockUsers(5, [{ overrides: { active: false } }]));

        //create admin
        const { token } = await createAdminAndLogin();

        const response = await testApp()
          .get('/api/users')
          .auth(token, { type: 'bearer' });

        expect(response.status).toBe(200);
        expect(response.body.data.data.length).toBe(6);
      });

      it('returns 403 for regular user', async () =>
        await attemptRouteAsUser('get', '/api/users'));
    });

    describe('creating user,', () => {
      it('disallows creating user', async () => {
        const { token } = await createAdminAndLogin();

        const response = await testApp()
          .post('/api/users')
          .auth(token, { type: 'bearer' })
          .send(mockUsers(1));

        expect(response.status).toBe(400);
      });
    });

    describe('getting user', () => {
      it('returns user document matching specified ID to admin', async () => {
        const testUser = await User.create(mockUsers(1));
        const { token } = await createAdminAndLogin();

        const response = await testApp()
          .get(`/api/users/${testUser.id}`)
          .auth(token, { type: 'bearer' });

        expect(response.status).toBe(200);
        expect(response.body.data.data._id).toBe(testUser.id);
      });

      it('returns 404 for non-existent user', async () => {
        const { token } = await createAdminAndLogin();
        const fakeUserId = new mongoose.Types.ObjectId();

        const response = await testApp()
          .get(`/api/users/${fakeUserId}`)
          .auth(token, { type: 'bearer' });

        expect(response.status).toBe(404);
      });

      it('returns 403 for regular user', async () =>
        attemptRouteAsUser('get', `/api/users/testid`));
    });

    describe('updating user', () => {
      it('updates and returns user with specified ID', async () => {
        const testUser = await User.create(mockUsers(1));
        const { token } = await createAdminAndLogin();

        const newUserInfo = {
          name: 'new name',
          email: 'newemail@test.com',
          tagline: 'new tagline',
          bio: 'new bio',
          active: false,
          interests: '',
          favorites: [],
          privateFavorites: !testUser.privateFavorites,
        };

        const response = await testApp()
          .patch(`/api/users/${testUser.id}`)
          .auth(token, { type: 'bearer' })
          .send(newUserInfo);

        expect(response.status).toBe(200);
        expect(response.body.data.data).toMatchObject(newUserInfo);
      });

      it('disallows password change', async () => {
        const testUser = await User.create(mockUsers(1));
        const { token } = await createAdminAndLogin();

        const newUserInfo = {
          password: 'newpassword',
          passwordConfirm: 'newpassword',
        };

        const response = await testApp()
          .patch(`/api/users/${testUser.id}`)
          .auth(token, { type: 'bearer' })
          .send(newUserInfo);

        expect(response.status).toBe(400);
      });

      it('filters role and password reset related fields', async () => {
        const testUser = await User.create(mockUsers(1));
        const { token } = await createAdminAndLogin();

        const newUserInfo = {
          role: 'admin',
          passwordResetToken: 'newtoken',
          passwordResetExpires: new Date(),
          passwordChangedAt: new Date(),
        };

        const response = await testApp()
          .patch(`/api/users/${testUser.id}`)
          .auth(token, { type: 'bearer' })
          .send(newUserInfo);

        expect(response.status).toBe(200);
        expect(response.body.data.data).not.toMatchObject(newUserInfo);
      });

      it('returns 404 for non-existent user', async () => {
        const { token } = await createAdminAndLogin();
        const fakeUserId = new mongoose.Types.ObjectId();

        const response = await testApp()
          .patch(`/api/users/${fakeUserId}`)
          .auth(token, { type: 'bearer' })
          .send({ name: 'new name' });

        expect(response.status).toBe(404);
      });

      it('returns 403 for regular user', async () =>
        attemptRouteAsUser('patch', `/api/users/testid`, { name: 'new name' }));
    });

    describe('deleting user', () => {
      it('deletes user with specified ID', async () => {
        const testUser = await User.create(mockUsers(1));
        const { token } = await createAdminAndLogin();

        const response = await testApp()
          .delete(`/api/users/${testUser.id}`)
          .auth(token, { type: 'bearer' });

        expect(response.status).toBe(204);

        const deletedUser = await User.findById(testUser.id);
        expect(deletedUser).toBeNull();
      });

      it('returns 404 for non-existent user', async () => {
        const { token } = await createAdminAndLogin();
        const fakeUserId = new mongoose.Types.ObjectId();

        const response = await testApp()
          .delete(`/api/users/${fakeUserId}`)
          .auth(token, { type: 'bearer' });

        expect(response.status).toBe(404);
      });

      it('returns 403 for regular user', async () =>
        attemptRouteAsUser('delete', `/api/users/testid`));
    });
  });
});
