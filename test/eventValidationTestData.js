const { mockTickets } = require('./mock-data/mockData');

module.exports = [
  //event name
  { overrides: { name: undefined }, expected: 'must have a name' },
  {
    overrides: {
      name:
        'kgsjrxxzgebfsuvvwoekysrpcknankdbivlfhgxuvcbekcyukazgosxpxlbtnppkhjjwanwidrbtxwlwzuhsvartwcrieytaiujxrlkcagyp',
    },
    expected: 'name cannot exceed 75 characters',
  },
  {
    overrides: { name: 'lorem' },
    expected: 'name should be at least 8 characters',
  },
  //event type
  {
    overrides: { type: null },
    expected: 'specify an event type',
  },
  {
    overrides: { type: 'Pow-Wow' },
    expected: 'invalid event type',
  },
  //event category
  {
    overrides: { category: null },
    expected: 'specify an event category',
  },
  {
    overrides: { category: 'Tournament' },
    expected: 'invalid event category',
  },
  //event description
  {
    overrides: { description: null },
    expected: 'must have a description',
  },
  //address
  {
    overrides: {
      location: {
        type: 'Point',
        coordinates: [0, 0],
      },
      address: null,
    },
    expected: 'address without a location',
  },
  //location
  {
    overrides: {
      address: '123 Fake St',
      location: null,
    },
    expected: 'location without an address',
  },
  {
    overrides: {
      location: {
        type: 'Point',
        coordinates: [2],
      },
    },
    expected: 'invalid coordinates',
  },
  {
    overrides: {
      location: {
        type: 'Sphere',
        coordinates: [0, 0],
      },
    },
    expected: 'invalid location',
  },
  {
    overrides: {
      location: {
        type: 'Point',
        coordinates: null,
      },
    },
    expected: 'coordinates are required',
  },
  //total capacity
  {
    overrides: { totalCapacity: null },
    expected: 'total capacity',
  },
  {
    overrides: { totalCapacity: -1 },
    expected: 'capacity cannot be negative',
  },
  //ticketTiers
  {
    overrides: { ticketTiers: null },
    expected: 'must have ticket tiers',
  },
  {
    overrides: { ticketTiers: [] },
    expected: 'one ticket type is required',
  },
  {
    overrides: { ticketTiers: mockTickets(11) },
    expected: 'more than 10 ticket types',
  },
  {
    overrides: {
      ticketTiers: mockTickets(2, [
        { overrides: { tierName: 'test' } },
        { overrides: { tierName: 'test' } },
      ]),
    },
    expected: 'ticket names must be unique',
  },
  {
    overrides: {
      totalCapacity: 2,
      ticketTiers: mockTickets(2, [
        { overrides: { capacity: 1 } },
        { overrides: { capacity: 2 } },
      ]),
    },
    expected: 'ticket capacities cannot exceed the event total',
  },
  {
    overrides: {
      totalCapacity: 2,
      ticketTiers: [mockTickets(1, [{ overrides: { capacity: 1 } }])],
    },
    expected: 'all tickets have limited capacity',
  },
  //ticket tier name
  {
    overrides: {
      ticketTiers: [mockTickets(1, [{ overrides: { tierName: '' } }])],
    },
    expected: 'ticket name is required',
  },
  {
    overrides: {
      ticketTiers: [
        mockTickets(1, [
          {
            overrides: {
              tierName: 'zzphwxagppocwwzizjuzhpwcwaxxgnkikckfypbsrexosmyhjti',
            },
          },
        ]),
      ],
    },
    expected: 'ticket name cannot exceed 50 characters',
  },
  //ticket tier description
  {
    overrides: {
      ticketTiers: [mockTickets(1, [{ overrides: { tierDescription: null } }])],
    },
    expected: 'ticket description is required',
  },
  {
    overrides: {
      ticketTiers: [mockTickets(1, [{ overrides: { tierDescription: '' } }])],
    },
    expected: 'ticket description',
  },
  {
    overrides: {
      ticketTiers: [
        mockTickets(1, [
          {
            overrides: {
              tierDescription:
                'vmysbbamuwmwriolxqgadjoyltktmrflcxonihchdwjfgupablbxofmbosrmafsgckvrayxplqqwnfnjorpxpxthtmyqcujafkwcwqclbgttxjayivwdanakwpyymojnbkihkvtskxlptjulrbdgzjl',
            },
          },
        ]),
      ],
    },
    expected: 'ticket description cannot exceed 150 characters',
  },
  //ticket tier price
  {
    overrides: {
      ticketTiers: [mockTickets(1, [{ overrides: { price: null } }])],
    },
    expected: 'ticket price is required',
  },
  {
    overrides: {
      ticketTiers: [mockTickets(1, [{ overrides: { price: -1 } }])],
    },
    expected: 'ticket price must be a positive',
  },
  //ticket tier online
  {
    overrides: {
      ticketTiers: [mockTickets(1, [{ overrides: { online: null } }])],
    },
    expected: 'online ticket status is required',
  },
  //ticket tier capacity
  {
    overrides: {
      ticketTiers: [mockTickets(1, [{ overrides: { capacity: -1 } }])],
    },
    expected: 'ticket capacity must be a positive',
  },
  //ticket tier limit per customer
  {
    overrides: {
      totalCapacity: 1,
      ticketTiers: [
        {
          tierName: 'Test',
          tierDescription: 'Test',
          price: 1,
          online: true,
          capacity: 1,
          limitPerCustomer: -1,
        },
      ],
    },
    expected: 'limit must be a positive',
  },
  {
    overrides: {
      totalCapacity: 2,
      ticketTiers: [
        {
          tierName: 'Test',
          tierDescription: 'Test',
          price: 1,
          online: true,
          capacity: 2,
          limitPerCustomer: 3,
        },
      ],
    },
    expected: 'limit cannot exceed ticket capacity',
  },
];
