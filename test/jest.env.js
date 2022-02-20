//Environment Variables
process.env.RATE_LIMIT_MAX_REQUESTS = 10000;
process.env.JWT_SECRET = 'secret';
process.env.NODE_ENV = 'testing';
process.env.JWT_EXPIRES_IN = '900000000';
process.env.JWT_COOKIE_EXPIRES_IN = '15m';
process.env.STRIPE_SECRET_KEY = 'sk_test_kjdhf98re0yf';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_51Ibx4EH1QVoCyfVJAE3qWj';
process.env.AWS_BUCKET = 'test-bucket';

process.env.MAILTRAP_API_KEY = '6e64a0ea1e470732293f6124fb29a9cb';
process.env.TEST_INBOX_ID = '1273252';
process.env.EMAIL_USERNAME = '8b8c2348843588';
process.env.EMAIL_PASSWORD = '9e078cf460bd40';
process.env.EMAIL_HOST = 'smtp.mailtrap.io';
process.env.EMAIL_PORT = 587;
process.env.EMAIL_FROM = 'test@test.com';
