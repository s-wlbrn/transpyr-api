const nodemailer = require('nodemailer');
const pug = require('pug');
const { htmlToText } = require('html-to-text');

module.exports = class Email {
  constructor(user, url, event) {
    this.to = user.email;
    this.name = user.name;
    this.url = url;
    this.event = event;
    this.from = `Transpyr <${process.env.EMAIL_FROM}>`;
  }

  newTransport() {
    if (process.env.NODE_ENV === 'production') {
      //Sendgrid
      return nodemailer.createTransport({
        service: 'SendGrid',
        auth: {
          user: process.env.SENDGRID_USERNAME,
          pass: process.env.SENDGRID_PASSWORD,
        },
      });
    }

    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD,
      },
    });
  }

  async send(template, subject) {
    //send the actual email
    // render html based on pug template
    const html = pug.renderFile(
      `${__dirname}/../templates/emails/${template}.pug`,
      { name: this.name, url: this.url, event: this.event, subject }
    );

    //define email options
    const mailOptions = {
      from: this.from,
      to: this.to,
      subject,
      html,
      text: htmlToText(html),
    };

    //create transport, send email
    await this.newTransport().sendMail(mailOptions);
  }

  async sendWelcome() {
    await this.send('welcome', 'Welcome to Transpyr!');
  }

  async sendPasswordReset() {
    await this.send(
      'passwordReset',
      'Your password reset request (valid for 10 minutes)'
    );
  }

  async sendBookingSuccess() {
    await this.send('bookingSuccess', 'Booking confirmation');
  }

  async sendBookingSuccessGuest() {
    await this.send('bookingSuccessGuest', 'Booking confirmation');
  }

  async sendCancelationRequestOrganizer() {
    await this.send(
      'cancelationRequestOrganizer',
      "You've received a booking cancelation request for your event"
    );
  }

  async sendCancelationRequestAcceptedOrganizer() {
    await this.send(
      'cancelationRequestAcceptedOrganizer',
      'You have accepted a booking cancelation request.'
    );
  }

  async sendCancelationRequestAcceptedAttendee() {
    await this.send(
      'cancelationRequestAcceptedAttendee',
      'Your booking cancelation request has been accepted'
    );
  }

  async sendCancelationRequestRejectedAttendee() {
    await this.send(
      'cancelationRequestRejectedAttendee',
      'Your booking cancelation request has been rejected'
    );
  }
};
