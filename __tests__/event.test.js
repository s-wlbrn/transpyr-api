const mongoose = require('mongoose');
const { S3 } = require('aws-sdk');
const Event = require('../models/event.model');
const Booking = require('../models/booking.model');
const {
  setupUsers,
  setupEvents,
  setupBookings,
} = require('../test/helpers/dbHelpers');
const {
  createUserAndLogin,
  createAdminAndLogin,
  createGuest,
} = require('../test/helpers/authHelpers');
const {
  mockEvents,
  mockUsers,
  mockBookings,
  mockTickets,
} = require('../test/mock-data/mockData');
const validationTestData = require('../test/eventValidationTestData');
const createUserRequestPromises = require('../test/helpers/createUserRequestPromises');
const testApp = require('../test/testApp');

describe('Events', () => {
  describe('Getting all events', () => {
    it('returns all published events for guest and user, all events for admin', async () => {
      //create six events, one unpubbed
      const testEvents = mockEvents(6, [{ overrides: { published: false } }]);
      await setupEvents(testEvents);

      //create a user
      const loggedInUser = await createUserAndLogin();
      //create admin
      const admin = await createAdminAndLogin();
      const guest = {};
      const users = [admin, loggedInUser, guest];

      const promises = users.map((user) => {
        const request = testApp().get('/api/events');
        if (user.token) {
          request.auth(user.token, { type: 'bearer' });
        }

        return request;
      });

      //get events
      const responses = await Promise.all(promises);

      //expect all successful
      expect(responses.filter((res) => res.status === 200).length).toBe(3);
      //all events returned for admin
      expect(responses[0].body.data.data.length).toBe(6);
      //only published events returned for guest and user
      expect(responses[1].body.data.data.length).toBe(5);
      expect(responses[2].body.data.data.length).toBe(5);
    });

    it('returns paginated results', async () => {
      //create 10 events
      const testEvents = mockEvents(10);
      await setupEvents(testEvents);

      //request all events with pagination
      const response = await testApp().get(
        '/api/events?paginate={"page": 1, "limit": 5}'
      );

      expect(response.status).toBe(200);
      expect(response.body.data.page).toBe(1);
      expect(response.body.data.pages).toBe(2);
      expect(response.body.data.data.length).toBe(5);
    });

    it('returns filtered results', async () => {
      //create three events, control category and totalCapacity
      const testEvents = mockEvents(3, [
        { overrides: { category: 'Food', totalCapacity: 10 } },
        { overrides: { category: 'Music', totalCapacity: 20 } },
        { overrides: { category: 'Vehicle', totalCapacity: 30 } },
      ]);
      await setupEvents(testEvents);

      //filter with equality
      const res = await testApp().get('/api/events?category=Food');
      expect(res.status).toBe(200);
      expect(res.body.data.data.length).toBe(1);
      expect(res.body.data.data[0].name).toBe(testEvents[0].name);

      //filter with gt and lt
      const res2 = await testApp().get(
        '/api/events?totalCapacity[gt]=19&totalCapacity[lt]=21'
      );
      expect(res2.status).toBe(200);
      expect(res2.body.data.data.length).toBe(1);
      expect(res2.body.data.data[0].name).toBe(testEvents[1].name);

      //filter with gt and lt
      const res3 = await testApp().get(
        '/api/events?totalCapacity[gte]=29&totalCapacity[lte]=30'
      );
      expect(res3.status).toBe(200);
      expect(res3.body.data.data.length).toBe(1);
      expect(res3.body.data.data[0].name).toBe(testEvents[2].name);
    });

    it('returns sorted results', async () => {
      //create 3 events, control dateTimeStart
      const newDate = new Date();
      const testEvents = mockEvents(3, [
        {
          overrides: {
            dateTimeStart: newDate.setFullYear(newDate.getFullYear() + 1),
          },
        },
        {
          overrides: {
            dateTimeStart: newDate.setFullYear(newDate.getFullYear() + 2),
          },
        },
        {
          overrides: {
            dateTimeStart: newDate.setFullYear(newDate.getFullYear() + 3),
          },
        },
      ]);
      await setupEvents(testEvents);

      //sort by date ascending
      const res1 = await testApp().get('/api/events?sort=dateTimeStart');
      expect(res1.status).toBe(200);
      expect(new Date(res1.body.data.data[0].dateTimeStart)).toStrictEqual(
        new Date(testEvents[0].dateTimeStart)
      );

      //sort descending
      const res2 = await testApp().get('/api/events?sort=-dateTimeStart');
      expect(res2.status).toBe(200);
      expect(new Date(res2.body.data.data[0].dateTimeStart)).toStrictEqual(
        new Date(testEvents[2].dateTimeStart)
      );
    });

    it('returns search results', async () => {
      //create three events, two with test in the name
      const testEvents = mockEvents(3, [
        { overrides: { name: 'Test Event 1' } },
        { overrides: { name: 'Test Event 2' } },
      ]);
      await setupEvents(testEvents);

      //search with 'test' as query
      const response = await testApp().get('/api/events?search=test');

      expect(response.status).toBe(200);
      expect(response.body.data.data.length).toBe(2);
    });

    it('returns location results', async () => {
      //create two events, one with controlled location
      const testLat = 35.15534535644242;
      const testLon = -90.05233838247685;
      const testEvents = mockEvents(2, [
        {
          overrides: {
            ticketTiers: [
              {
                tierName: 'In-Person Ticket',
                tierDescription: 'In-person ticket',
                capacity: 0,
                limitPerCustomer: 1,
                online: false,
                price: 10,
              },
            ],
            location: {
              type: 'Point',
              coordinates: [testLon, testLat],
            },
          },
        },
      ]);
      await setupEvents(testEvents);

      //get all events by location
      const response = await testApp().get(
        `/api/events?loc[center]=${testLon},${testLat}&loc[radius]=10`
      );
      expect(response.status).toBe(200);
      expect(response.body.data.data.length).toBe(1);
      expect(response.body.data.data[0].name).toBe(testEvents[0].name);
    });

    it('returns limited fields', async () => {
      //create events
      const testEvents = mockEvents(2);
      await setupEvents(testEvents);

      //expected shape of returned event document
      const expectedObject = {
        _id: expect.any(String),
        id: expect.any(String),
        name: expect.any(String),
      };

      //get all events with only name and online fields
      const res = await testApp().get('/api/events?fields=name');
      expect(res.status).toBe(200);
      expect(res.body.data.data[0]).toStrictEqual(expectedObject);

      //get all events with mongoose-opaginate handling limiting projection
      const res2 = await testApp().get(
        '/api/events?fields=name&paginate[page]=1&paginate[limit]=1'
      );
      expect(res2.status).toBe(200);
      expect(res2.body.data.data[0]).toStrictEqual(expectedObject);
    });
  });

  describe('getting one event', () => {
    it('returns event with matching ID and populated organizer field', async () => {
      const { id, name, photo, tagline } = await setupUsers(mockUsers(1));
      const testEvent = await setupEvents(
        mockEvents(1, { overrides: { organizer: id } })
      );

      const expectedOrganizer = {
        _id: id,
        id,
        name,
        photo,
        tagline,
      };

      const response = await testApp().get(`/api/events/${testEvent._id}`);
      expect(response.status).toBe(200);
      expect(response.body.data.data.name).toBe(testEvent.name);
      expect(response.body.data.data.organizer).toStrictEqual(
        expectedOrganizer
      );
    });

    it('returns unpublished event for organizer or admin, 403 for other users', async () => {
      const organizer = await createUserAndLogin();
      const otherUser = await createUserAndLogin();
      const admin = await createAdminAndLogin();
      const { _id } = await setupEvents(
        mockEvents(1, {
          overrides: { organizer: organizer.user._id, published: false },
        })
      );

      //request unpublished event with organizer and admin
      const users = [organizer, otherUser, admin];
      const requestPromises = createUserRequestPromises(
        users,
        `/api/events/${_id}`,
        { method: 'get' }
      );

      const responses = await Promise.all(requestPromises);

      expect(responses.filter((res) => res.status === 200).length).toBe(2);
      expect(responses.filter((res) => res.status === 403).length).toBe(1);
    });
  });

  describe('getting user booked events', () => {
    it('returns user booked events', async () => {
      //create user
      const { token, user } = await createUserAndLogin();
      //create events
      await setupEvents(mockEvents(2));
      const testEvents = await Event.find();
      //create three bookings for event
      const testBookings = mockBookings(3, [
        {
          overrides: {
            event: testEvents[0].id,
            user: user._id,
            ticket: testEvents[0].ticketTiers[0].id,
          },
        },
        {
          overrides: {
            event: testEvents[0].id,
            user: user._id,
            ticket: testEvents[0].ticketTiers[0].id,
          },
        },
        {
          overrides: {
            event: testEvents[1].id,
            user: user._id,
            ticket: testEvents[1].ticketTiers[0].id,
          },
        },
      ]);
      await setupBookings(testBookings);

      //get user booked events
      const response = await testApp()
        .get('/api/events/me/booked')
        .auth(token, { type: 'bearer' });

      const { data } = response.body.data;
      expect(response.status).toBe(200);
      expect(data.length).toBe(2);
      expect(data.find((el) => el.name === testEvents[0].name).total).toBe(2);
      expect(data.find((el) => el.name === testEvents[1].name).total).toBe(1);
    });

    it('returns 401 for guest', async () => {
      const response = await testApp().get('/api/events/me/booked');
      expect(response.status).toBe(401);
    });
  });

  describe('getting user managed events', () => {
    it('returns user managed events', async () => {
      //create user
      const { token, user } = await createUserAndLogin();
      //create two events
      const { insertedIds } = await setupEvents(
        mockEvents(2, [
          { overrides: { organizer: user._id } },
          { overrides: { organizer: user._id } },
        ])
      );

      //get user managed events
      const response = await testApp()
        .get('/api/events/me/managed')
        .auth(token, { type: 'bearer' });

      const { data } = response.body.data;
      const eventIds = Object.values(insertedIds);
      expect(response.status).toBe(200);
      expect(data.length).toBe(2);
      expect(
        data.some((el) => String(el._id) === String(eventIds[0]))
      ).toBeTruthy();
      expect(
        data.some((el) => String(el._id) === String(eventIds[1]))
      ).toBeTruthy();
    });

    it('returns 401 for guest', async () => {
      const response = await testApp().get('/api/events/me/managed');
      expect(response.status).toBe(401);
    });
  });

  describe('creating event', () => {
    it('creates event with user as organizer', async () => {
      const { token, user } = await createUserAndLogin();
      const event = mockEvents(1, { overrides: { organizer: undefined } });
      const response = await testApp()
        .post('/api/events')
        .send(event)
        .auth(token, { type: 'bearer' });
      expect(response.status).toBe(201);
      expect(response.body.data.data.organizer).toBe(user._id);
    });

    it('returns 401 for guest', async () => {
      const event = mockEvents(1, { overrides: { organizer: undefined } });
      const response = await testApp().post('/api/events').send(event);
      expect(response.status).toBe(401);
    });

    //filters certain fields
    it('filters invalid request body fields', async () => {
      const { token } = await createUserAndLogin();

      //create event with random organizer id and published field
      const testEvent = mockEvents(1);
      testEvent.published = true;

      const response = await testApp()
        .post('/api/events')
        .send(testEvent)
        .auth(token, { type: 'bearer' });
      expect(response.status).toBe(201);

      expect(response.body.data.data.published).toBe(false);
      expect(response.body.data.data.organizer).not.toBe(testEvent.organizer);
    });

    //validation errors
    it.each(validationTestData)(
      'returns 400 for invalid event: $expected',
      async ({ overrides, expected }) => {
        const { token } = await createUserAndLogin();
        const testEvent = mockEvents(1, [{ overrides }]);

        const response = await testApp()
          .post('/api/events')
          .send(testEvent)
          .auth(token, { type: 'bearer' });

        expect(response.status).toBe(400);
        expect(response.body.message).toEqual(
          expect.stringMatching(RegExp(expected, 'i'))
        );
      }
    );
  });

  describe('updating event', () => {
    it('updates event with user as organizer', async () => {
      //create user, initialize event
      const { token, user } = await createUserAndLogin();
      const event = await setupEvents(
        mockEvents(1, {
          overrides: { organizer: user._id, ticketTiers: mockTickets(3) },
        })
      );

      const updatedEvent = {
        name: 'updated event',
        description: 'updated description',
        ticketTiers: [
          ...event.ticketTiers,
          {
            tierName: 'new ticket',
            tierDescription: 'new ticket description',
            online: false,
            price: 100,
            capacity: 0,
            limitPerCustomer: 4,
          },
        ],
      };

      const response = await testApp()
        .put(`/api/events/${event.id}`)
        .send(updatedEvent)
        .auth(token, { type: 'bearer' });

      expect(response.status).toBe(200);
      expect(response.body.data.data.name).toBe(updatedEvent.name);
      expect(response.body.data.data.description).toBe(
        updatedEvent.description
      );
      expect(response.body.data.data.ticketTiers.length).toBe(
        event.ticketTiers.length + 1
      );
    });

    it('filters invalid request body fields', async () => {
      const { token, user } = await createUserAndLogin();
      const event = await setupEvents(
        mockEvents(1, { overrides: { organizer: user._id } })
      );

      const updatedEvent = {
        published: false,
        canceled: true,
      };

      const response = await testApp()
        .put(`/api/events/${event.id}`)
        .send(updatedEvent)
        .auth(token, { type: 'bearer' });
      expect(response.status).toBe(200);
      expect(response.body.data.data.published).toBe(true);
      expect(response.body.data.data.canceled).toBe(false);
    });

    it('returns 401 for guest and 403 when user not organizer', async () => {
      const event = await setupEvents(mockEvents(1));
      const nonOrganizer = await createUserAndLogin();
      const guest = createGuest();
      const users = [nonOrganizer, guest];

      const updatedEvent = {
        name: 'updated event',
      };

      const responsePromises = users.map((user) => {
        const apiCall = testApp()
          .put(`/api/events/${event.id}`)
          .send(updatedEvent);
        if (user.token) {
          apiCall.auth(user.token, { type: 'bearer' });
        }
        return apiCall;
      });

      const responses = await Promise.all(responsePromises);
      expect(responses[0].status).toBe(403);
      expect(responses[1].status).toBe(401);
    });

    it('returns 400 when attempting to remove ticket', async () => {
      const { token, user } = await createUserAndLogin();
      const event = await setupEvents(
        mockEvents(1, {
          overrides: { organizer: user._id, ticketTiers: mockTickets(2) },
        })
      );

      const updatedTickets = event.ticketTiers.slice(0, -1);
      const updatedEvent = {
        ticketTiers: updatedTickets,
      };

      const response = await testApp()
        .put(`/api/events/${event.id}`)
        .send(updatedEvent)
        .auth(token, { type: 'bearer' });
      expect(response.status).toBe(400);
      expect(response.body.message).toEqual(
        expect.stringMatching(/tickets cannot be removed/i)
      );
    });

    it('returns 404 when event to update not found', async () => {
      const { token } = await createUserAndLogin();
      const fakeEventId = mongoose.Types.ObjectId();

      const updatedEvent = {
        name: 'updated name',
      };

      const response = await testApp()
        .put(`/api/events/${fakeEventId}`)
        .send(updatedEvent)
        .auth(token, { type: 'bearer' });
      expect(response.status).toBe(404);
      expect(response.body.message).toEqual(
        expect.stringMatching(/not found/i)
      );
    });

    const invalidEventTestData = [
      { overrides: { canceled: true }, message: 'canceled' },
      {
        overrides: { dateTimeStart: Date.now() },
        message: 'past',
      },
    ];

    it.each(invalidEventTestData)(
      'returns 400 for invalid event',
      async ({ overrides, message }) => {
        const { token, user } = await createUserAndLogin();
        const testEvent = await setupEvents(
          mockEvents(1, [{ overrides: { ...overrides, organizer: user._id } }])
        );

        const updatedEvent = {
          name: 'updated name',
        };

        const response = await testApp()
          .put(`/api/events/${testEvent.id}`)
          .send(updatedEvent)
          .auth(token, { type: 'bearer' });
        expect(response.status).toBe(400);
        expect(response.body.message).toEqual(
          expect.stringMatching(RegExp(message, 'i'))
        );
      }
    );
  });

  describe('uploading event photo', () => {
    //updates event photo
    it('updates event photo', async () => {
      const mockPutObject = jest.spyOn(S3.prototype, 'putObject');

      const { token, user } = await createUserAndLogin();
      const testEvent = await setupEvents(
        mockEvents(1, [{ overrides: { organizer: user._id } }])
      );
      expect(testEvent.photo).toBe('default.jpeg');

      const response = await testApp()
        .patch(`/api/events/${testEvent.id}`)
        .attach('photo', './test/mock-data/test-image.jpg')
        .auth(token, { type: 'bearer' });

      expect(mockPutObject).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: `events/${testEvent.id}.jpeg`,
        Body: expect.any(Buffer),
      });

      expect(response.status).toBe(200);
      expect(response.body.data.data.photo).toBe(`${testEvent.id}.jpeg`);
    });

    it('returns 403 when user is not event organizer and 401 when user not logged in', async () => {
      const testEvent = await setupEvents(mockEvents(1));
      const otherUser = await createUserAndLogin();
      const guest = createGuest();
      const users = [otherUser, guest];

      const responsePromises = users.map((user) => {
        const apiCall = testApp()
          .patch(`/api/events/${testEvent.id}`)
          .attach('photo', './test/mock-data/test-image.jpg');
        if (user.token) {
          apiCall.auth(user.token, { type: 'bearer' });
        }
        return apiCall;
      });
      const responses = await Promise.all(responsePromises);

      expect(responses[0].status).toBe(403);
      expect(responses[1].status).toBe(401);
      expect(responses[0].body.message).toEqual(
        expect.stringMatching(/organizer/i)
      );
      expect(responses[1].body.message).toEqual(
        expect.stringMatching(/logged in/i)
      );
    });

    it('returns 404 when event not found', async () => {
      const { token } = await createUserAndLogin();
      const fakeEventId = mongoose.Types.ObjectId();

      const response = await testApp()
        .patch(`/api/events/${fakeEventId}`)
        .attach('photo', './test/mock-data/test-image.jpg')
        .auth(token, { type: 'bearer' });

      expect(response.status).toBe(404);
      expect(response.body.message).toEqual(
        expect.stringMatching(/not found/i)
      );
    });

    it('returns 400 when no file is provided', async () => {
      const { token, user } = await createUserAndLogin();
      const event = await setupEvents(
        mockEvents(1, { overrides: { organizer: user._id } })
      );

      const response = await testApp()
        .patch(`/api/events/${event.id}`)
        .auth(token, { type: 'bearer' });
      expect(response.status).toBe(400);
      expect(response.body.message).toEqual(
        expect.stringMatching(/provide a photo/i)
      );
    });

    it('returns 400 when file sent in wrong field', async () => {
      const { token, user } = await createUserAndLogin();
      const event = await setupEvents(
        mockEvents(1, { overrides: { organizer: user._id } })
      );

      const response = await testApp()
        .patch(`/api/events/${event.id}`)
        .attach('file', './test/mock-data/test-image.jpg')
        .auth(token, { type: 'bearer' });
      expect(response.status).toBe(400);
      expect(response.body.message).toEqual(
        expect.stringMatching(/unexpected field/i)
      );
    });

    it('returns 400 when file is not an image', async () => {
      const { token, user } = await createUserAndLogin();
      const event = await setupEvents(
        mockEvents(1, { overrides: { organizer: user._id } })
      );

      const response = await testApp()
        .patch(`/api/events/${event.id}`)
        .attach('photo', './test/mock-data/not-image.txt')
        .auth(token, { type: 'bearer' });
      expect(response.status).toBe(400);
      expect(response.body.message).toEqual(
        expect.stringMatching(/not an image/i)
      );
    });
  });

  describe('canceling event', () => {
    it('cancels event and all associated bookings when user is organizer', async () => {
      //create user
      const { token, user } = await createUserAndLogin();
      //create event with multiple tickets
      const testEvent = await setupEvents(
        mockEvents(1, [
          {
            overrides: {
              organizer: user._id.toString(),
              ticketTiers: mockTickets(2),
            },
          },
        ])
      );
      //create bookings for both tickets
      await setupBookings(
        mockBookings(2, [
          {
            overrides: {
              event: testEvent.id,
              ticket: testEvent.ticketTiers[0].id,
            },
          },
          {
            overrides: {
              event: testEvent.id,
              ticket: testEvent.ticketTiers[1].id,
            },
          },
        ])
      );

      // cancel event
      const response = await testApp()
        .delete(`/api/events/${testEvent.id}`)
        .auth(token, { type: 'bearer' });
      expect(response.status).toBe(204);
      // check that event is canceled
      const event = await Event.findById(testEvent.id);
      expect(event.canceled).toBe(true);
      // check that bookings are canceled
      const bookings = await Booking.find({ event: testEvent.id });
      expect(bookings.length).toBe(2);
      expect(bookings[0].active).toBe(false);
      expect(bookings[1].active).toBe(false);
    });

    it('returns 403 when user is not organizer and 401 when user not logged in', async () => {
      const testEvent = await setupEvents(mockEvents(1));
      const otherUser = await createUserAndLogin();
      const guest = createGuest();
      const users = [otherUser, guest];

      const responsePromises = users.map((user) => {
        const apiCall = testApp().delete(`/api/events/${testEvent.id}`);
        if (user.token) {
          apiCall.auth(user.token, { type: 'bearer' });
        }
        return apiCall;
      });
      const responses = await Promise.all(responsePromises);

      expect(responses[0].status).toBe(403);
      expect(responses[1].status).toBe(401);
    });

    it('returns 404 when event not found', async () => {
      const { token } = await createUserAndLogin();
      const fakeEventId = mongoose.Types.ObjectId();

      const response = await testApp()
        .delete(`/api/events/${fakeEventId}`)
        .auth(token, { type: 'bearer' });

      expect(response.status).toBe(404);
    });

    it('returns 400 when event is already canceled', async () => {
      const { token, user } = await createUserAndLogin();
      const event = await setupEvents(
        mockEvents(1, { overrides: { organizer: user._id, canceled: true } })
      );

      const response = await testApp()
        .delete(`/api/events/${event.id}`)
        .auth(token, { type: 'bearer' });
      expect(response.status).toBe(400);
      expect(response.body.message).toEqual(
        expect.stringMatching(/already canceled/i)
      );
    });

    it('returns 400 when event is in the past', async () => {
      const { token, user } = await createUserAndLogin();
      const event = await setupEvents(
        mockEvents(1, {
          overrides: { organizer: user._id, dateTimeStart: Date.now() },
        })
      );

      const response = await testApp()
        .delete(`/api/events/${event.id}`)
        .auth(token, { type: 'bearer' });
      expect(response.status).toBe(400);
      expect(response.body.message).toEqual(expect.stringMatching(/past/i));
    });
  });

  describe('canceling ticket', () => {
    it('cancels ticket and all associated bookings when user is organizer', async () => {
      const { token, user } = await createUserAndLogin();
      const testEvent = await setupEvents(
        mockEvents(1, [
          {
            overrides: {
              organizer: user._id.toString(),
              ticketTiers: mockTickets(2),
            },
          },
        ])
      );
      //create bookings for both tickets
      await setupBookings(
        mockBookings(3, [
          {
            overrides: {
              event: testEvent.id,
              ticket: testEvent.ticketTiers[0].id,
            },
          },
          {
            overrides: {
              event: testEvent.id,
              ticket: testEvent.ticketTiers[0].id,
            },
          },
          {
            overrides: {
              event: testEvent.id,
              ticket: testEvent.ticketTiers[1].id,
            },
          },
        ])
      );

      // cancel ticket
      const response = await testApp()
        .delete(
          `/api/events/${testEvent.id}/ticket/${testEvent.ticketTiers[0].id}`
        )
        .auth(token, { type: 'bearer' });
      expect(response.status).toBe(204);
      // check that ticket is canceled
      const resultEvent = await Event.findById(testEvent.id);
      expect(resultEvent.ticketTiers[0].canceled).toBe(true);
      expect(resultEvent.ticketTiers[1].canceled).toBe(false);
      // check that bookings are canceled
      const bookings = await Booking.find({ event: testEvent.id });
      expect(bookings.length).toBe(3);
      expect(bookings.filter((b) => b.active).length).toBe(1);
    });
  });

  it('returns 400 when ticket already canceled', async () => {
    const { token, user } = await createUserAndLogin();
    const testTickets = mockTickets(3, [{ overrides: { canceled: true } }]);
    const testEvent = await setupEvents(
      mockEvents(1, [
        {
          overrides: {
            organizer: user._id.toString(),
            ticketTiers: testTickets,
          },
        },
      ])
    );

    const response = await testApp()
      .delete(
        `/api/events/${testEvent.id}/ticket/${testEvent.ticketTiers[0].id}`
      )
      .auth(token, { type: 'bearer' });
    expect(response.status).toBe(400);
    expect(response.body.message).toEqual(
      expect.stringMatching(/already canceled/i)
    );
  });

  it('returns 404 when event not found', async () => {
    const { token } = await createUserAndLogin();
    const fakeEventId = mongoose.Types.ObjectId();

    const response = await testApp()
      .delete(`/api/events/${fakeEventId}/ticket/${mongoose.Types.ObjectId()}`)
      .auth(token, { type: 'bearer' });

    expect(response.status).toBe(404);
  });

  it('returns 404 when ticket not found', async () => {
    const { token, user } = await createUserAndLogin();
    const testEvent = await setupEvents(
      mockEvents(1, [
        { overrides: { ticketTiers: mockTickets(2), organizer: user._id } },
      ])
    );
    const fakeTicketId = mongoose.Types.ObjectId();

    const response = await testApp()
      .delete(`/api/events/${testEvent.id}/ticket/${fakeTicketId}`)
      .auth(token, { type: 'bearer' });

    expect(response.status).toBe(404);
  });

  it('returns 400 when event already canceled', async () => {
    const { token, user } = await createUserAndLogin();
    const testEvent = await setupEvents(
      mockEvents(1, [
        {
          overrides: {
            ticketTiers: mockTickets(2),
            organizer: user._id,
            canceled: true,
          },
        },
      ])
    );

    const response = await testApp()
      .delete(
        `/api/events/${testEvent.id}/ticket/${testEvent.ticketTiers[0].id}`
      )
      .auth(token, { type: 'bearer' });
    expect(response.status).toBe(400);
    expect(response.body.message).toEqual(
      expect.stringMatching(/event is already canceled/i)
    );
  });

  it('returns 400 when ticket to cancel is the last in the event', async () => {
    const { token, user } = await createUserAndLogin();
    const testEvent = await setupEvents(
      mockEvents(1, [
        { overrides: { organizer: user._id, ticketTiers: mockTickets(1) } },
      ])
    );

    const response = await testApp()
      .delete(
        `/api/events/${testEvent.id}/ticket/${testEvent.ticketTiers[0].id}`
      )
      .auth(token, { type: 'bearer' });

    expect(response.status).toBe(400);
    expect(response.body.message).toEqual(
      expect.stringMatching(/last ticket/i)
    );
  });

  it('returns 400 for past events', async () => {
    const { token, user } = await createUserAndLogin();
    const testEvent = await setupEvents(
      mockEvents(1, [
        { overrides: { organizer: user._id, dateTimeStart: Date.now() } },
      ])
    );

    const response = await testApp()
      .delete(
        `/api/events/${testEvent.id}/ticket/${testEvent.ticketTiers[0].id}`
      )
      .auth(token, { type: 'bearer' });

    expect(response.status).toBe(400);
    expect(response.body.message).toEqual(expect.stringMatching(/past/i));
  });

  describe('publishing event', () => {
    it('publishes event when user is organizer', async () => {
      const { token, user } = await createUserAndLogin();
      const testEvent = await setupEvents(
        mockEvents(1, [
          { overrides: { organizer: user._id, published: false } },
        ])
      );
      expect(testEvent.published).toBe(false);

      const response = await testApp()
        .patch(`/api/events/${testEvent.id}/publish`)
        .send({ feePolicy: 'passFee' })
        .auth(token, { type: 'bearer' });

      expect(response.status).toBe(200);
      expect(response.body.data.data.published).toBe(true);
    });

    it('returns 403 when not organizer and 401 when not logged in', async () => {
      const unauthorizedUser = await createUserAndLogin();
      const guest = createGuest();
      const testEvent = await setupEvents(
        mockEvents(1, [{ overrides: { published: false } }])
      );
      const users = [unauthorizedUser, guest];

      const requestPromises = createUserRequestPromises(
        users,
        `/api/events/${testEvent.id}/publish`,
        { method: 'patch', body: { feePolicy: 'passFee' } }
      );

      const responses = await Promise.all(requestPromises);
      expect(responses[0].status).toBe(403);
      expect(responses[1].status).toBe(401);
    });

    it('returns 400 when event already published', async () => {
      const { token, user } = await createUserAndLogin();
      const testEvent = await setupEvents(
        mockEvents(1, [{ overrides: { organizer: user._id } }])
      );

      const response = await testApp()
        .patch(`/api/events/${testEvent.id}/publish`)
        .send({ feePolicy: 'passFee' })
        .auth(token, { type: 'bearer' });

      expect(response.status).toBe(400);
      expect(response.body.message).toEqual(
        expect.stringMatching(/already published/i)
      );
    });

    it('returns 404 when event not found', async () => {
      const { token } = await createUserAndLogin();
      const fakeEventId = mongoose.Types.ObjectId();

      const response = await testApp()
        .patch(`/api/events/${fakeEventId}/publish`)
        .send({ feePolicy: 'passFee' })
        .auth(token, { type: 'bearer' });

      expect(response.status).toBe(404);
    });

    it('returns 400 for past event', async () => {
      const { token, user } = await createUserAndLogin();
      const testEvent = await setupEvents(
        mockEvents(1, [
          {
            overrides: {
              organizer: user._id,
              published: false,
              dateTimeStart: Date.now(),
            },
          },
        ])
      );

      const response = await testApp()
        .patch(`/api/events/${testEvent.id}/publish`)
        .send({ feePolicy: 'passFee' })
        .auth(token, { type: 'bearer' });

      expect(response.status).toBe(400);
      expect(response.body.message).toEqual(expect.stringMatching(/past/i));
    });

    it('returns 400 when no feePolicy specified', async () => {
      const { token, user } = await createUserAndLogin();
      const testEvent = await setupEvents(
        mockEvents(1, [
          {
            overrides: {
              organizer: user._id,
              published: false,
            },
          },
        ])
      );

      const response = await testApp()
        .patch(`/api/events/${testEvent.id}/publish`)
        .auth(token, { type: 'bearer' });

      expect(response.status).toBe(400);
      expect(response.body.message).toEqual(
        expect.stringMatching(/fee policy/i)
      );
    });

    it('returns 400 for invalid feePolicy', async () => {
      const { token, user } = await createUserAndLogin();
      const testEvent = await setupEvents(
        mockEvents(1, [
          {
            overrides: {
              organizer: user._id,
              published: false,
            },
          },
        ])
      );

      const response = await testApp()
        .patch(`/api/events/${testEvent.id}/publish`)
        .send({ feePolicy: 'invalidFeePolicy' })
        .auth(token, { type: 'bearer' });

      expect(response.status).toBe(400);
    });

    it('filters all body fields except refundPolicy and feePolicy', async () => {
      const { token, user } = await createUserAndLogin();
      const testEvent = await setupEvents(
        mockEvents(1, [
          {
            overrides: {
              organizer: user._id,
              published: false,
            },
          },
        ])
      );

      const response = await testApp()
        .patch(`/api/events/${testEvent.id}/publish`)
        .send({
          refundPolicy: 'refundPolicy',
          feePolicy: 'absorbFee',
          name: 'new name',
          description: 'new description',
        })
        .auth(token, { type: 'bearer' });

      expect(response.status).toBe(200);
      expect(response.body.data.data.refundPolicy).toEqual('refundPolicy');
      expect(response.body.data.data.feePolicy).toEqual('absorbFee');
      expect(response.body.data.data.name).toEqual(testEvent.name);
      expect(response.body.data.data.description).toEqual(
        testEvent.description
      );
    });
  });
});
