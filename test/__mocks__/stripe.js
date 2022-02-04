class Stripe {}
const stripe = jest.fn(() => new Stripe());

const createCheckout = jest.fn((data) => {
  const { metadata, customer_email, client_reference_id, line_items } = data;

  const formattedItems = line_items.flatMap((item) => {
    const individualBookings = [];
    for (let i = 0; i < item.quantity; ++i) {
      individualBookings.push({
        price: {
          unit_amount: item.price_data.unit_amount,
          product: {
            metadata: {
              ticketId: item.price_data.product_data.metadata.ticketId,
            },
          },
        },
      });
    }
    return individualBookings;
  });

  //create checkout id
  const id = `ch_${Math.floor(Math.random() * 100000)}`;
  //save session
  const session = {
    id,
    customer_email,
    client_reference_id,
    line_items: {
      data: formattedItems,
    },
    metadata,
  };

  this.sessions = {
    ...this.sessions,
    [id]: session,
  };

  return session;
});

const retrieveSession = jest.fn((id) => this.sessions[id]);
const constructEvent = jest.fn((req, signature) => ({
  type: 'checkout.session.completed',
  data: {
    object: {
      id: signature,
    },
  },
}));

Stripe.prototype.checkout = {
  sessions: {
    create: createCheckout,
    retrieve: retrieveSession,
  },
};

Stripe.prototype.webhooks = {
  constructEvent,
};

module.exports = stripe;
module.exports.Stripe = Stripe;
