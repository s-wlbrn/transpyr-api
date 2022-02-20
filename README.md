# transpyr-api

The Transpyr back-end api is a Node/Express REST API that handles Transpyr's user, event, and booking operations.

## Features

- User account creation, modification, and deactivation.
- Search for events by keyword, or query with the ability to sort, paginate, and filter by fields or location radius.
- Validate, create, and publish events.
- "Me" routes for authorized users to fetch their own bookings and events.
- Validate and create bookings.
- Create, query, and resolve refund requests.
- Handles checkout sessions with Stripe and leverages Stripe webhooks to create bookings.
- Automatically sends emails to attendees and organizers for important actions.
- Signs and decodes JSON web tokens for authorization, including refresh tokens sent in a secure, HTTPOnly cookie.
- Protects restricted routes based on bearer token authorization and user roles.
- Error handling middleware gracefully handles operational errors and logs unexpected ones.
- More powerful CRUD operations for admins, including the ability to view and modify unpublished events.
- Streams event/user images from Transpyr's Amazon S3 bucket.

## Technologies

The server is built with [**Node.js**](https://nodejs.org) and the [**Express**](https://expressjs.com) framework. It handles MongoDB database operations with the [**Mongoose**](https://mongoosejs.com/) ODM library.

Other libraries used:

- [**axios**](https://www.npmjs.com/package/axios) for fetching
- [**bcrypt**](https://www.npmjs.com/package/bcrypt) for password hashing
- [**aws-sdk**](https://www.npmjs.com/package/aws-sdk) for S3 bucket operations
- [**jsonwebtoken**](https://www.npmjs.com/package/jsonwebtoken) for JWT logic
- [**marked**](https://www.npmjs.com/package/marked) for Markdown parsing to HTML
- [**mongoose-paginate**](https://www.npmjs.com/package/mongoose-paginate) for enhanced pagination
- [**multer**](https://www.npmjs.com/package/multer) for multipart form data
- [**nodemailer**](https://www.npmjs.com/package/nodemailer) for emails
- [**pug**](https://www.npmjs.com/package/pug) for email templates
- [**sanitize-html**](https://www.npmjs.com/package/sanitize-html) for Marktown-to-HTML output sanitization
- [**sharp**](https://www.npmjs.com/package/sharp) for image processing
- [**stripe**](https://www.npmjs.com/package/stripe) for Stripe Checkout operations

## Installation

### **Environment Variables**

**Server config:**

- **NODE_ENV**:
  - development
  - production
  - testing
- **PORT**:
  - 3000 by default. Handled automatically by most hosting services.
- **FRONTEND_HOST**:
  - Host for Transpyr frontend.
  - Required for links contained in automated emails to work.
  - Sets 'domain' of refresh token's set-cookie header.
    - In production, **Transpyr and transpyr-api must be on the same domain for refresh tokens to work** due to cross-origin cookies being blocked by modern browsers.

**Database config:**

- **DB_URL**:
  ```
  mongodb://[username:<PASSWORD>@]host1[:port1],...hostN[:portN]][/[defaultauthdb][?options]]
  ```
  - MongoDB connection string
  - `<PASSWORD>` should be preserved. It is replaced programatically with the DB_PASS environment variable.
- **DB_PASS**:
  - MongoDB user password

**JWT config:**

- **JWT_SECRET**:
  - JWT secret key. At least 32 character length recomended.
- **JWT_EXPIRES_IN**:
  - JWT expiration in milliseconds

**DEVELOPMENT email config:**

- **EMAIL_USERNAME**:
  - Development email host username
- **EMAIL_PASSWORD**:
  - Development email host password
- **EMAIL_HOST**:
  - Development email host
- **EMAIL_PORT**:
  - Development email port
- **EMAIL_FROM**:
  - Development email from

**PRODUCTION email (Sendgrid) settings:**

- **SENDGRID_USERNAME**:
  - Usually 'apikey'
- **SENDGRID_PASSWORD**:
  - Sendgrid password or api key

**Stripe config:**

- **STRIPE_SECRET_KEY**:
  - Secret key for Stripe implementation
  - **This app was developed for the test implementation of Stripe and is not intended for use with a live Stripe implementation.**
- **STRIPE_WEBHOOK_SECRET**:
  - Secret for authorizing Stripe webhook requests

**AWS config:**

- **AWS_ACCESS_KEY_ID**
  - AWS access key ID, used for accessing app's S3 bucket
- **AWS_SECRET_ACCESS_KEY**
  - AWS access key, used for accessing app's S3 bucket

### **Starting the server**

- **npm start** starts the server.
- **npm run start-dev** runs the server with nodemon.

## API Documentation

[API Documentation](https://api.transpyr.com/docs)

## Credits

Email template based on [responsive-html-email-template](https://github.com/leemunroe/responsive-html-email-template) by Lee Munroe.

## License

transpyr-api
Copyright (C) 2022 Stephen Welbourn

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
