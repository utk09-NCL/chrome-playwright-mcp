import type { SubmitEvent } from 'react';
import { useState } from 'react';

type Errors = { name?: string; email?: string; message?: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Contact() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');

  function validate(): Errors {
    const found: Errors = {};
    if (name.trim() === '') found.name = 'Name is required';
    if (email.trim() === '') found.email = 'Email is required';
    else if (!EMAIL_PATTERN.test(email.trim())) found.email = 'Enter a valid email address';
    if (message.trim().length < 10) found.message = 'Message must be at least 10 characters';
    return found;
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setStatus('sending');
    await new Promise(resolve => setTimeout(resolve, 900));
    setStatus('sent');
    setName('');
    setEmail('');
    setMessage('');
  }

  return (
    <div className="page">
      <h1>Contact</h1>
      <p className="page-intro">Tell me about the thing you want built.</p>

      <form className="form" onSubmit={handleSubmit} noValidate data-testid="contact-form">
        <div className="field">
          <label htmlFor="name">Name</label>
          <input
            id="name"
            name="name"
            value={name}
            onChange={event => setName(event.target.value)}
          />
          {errors.name && (
            <p className="error" role="alert" data-testid="error-name">
              {errors.name}
            </p>
          )}
        </div>

        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            value={email}
            onChange={event => setEmail(event.target.value)}
          />
          {errors.email && (
            <p className="error" role="alert" data-testid="error-email">
              {errors.email}
            </p>
          )}
        </div>

        <div className="field">
          <label htmlFor="message">Message</label>
          <textarea
            id="message"
            name="message"
            rows={5}
            value={message}
            onChange={event => setMessage(event.target.value)}
          />
          {errors.message && (
            <p className="error" role="alert" data-testid="error-message">
              {errors.message}
            </p>
          )}
        </div>

        <button
          type="submit"
          className="button primary"
          data-testid="submit-button"
          disabled={status === 'sending'}
        >
          {status === 'sending' ? 'Sending' : 'Send message'}
        </button>
      </form>

      {status === 'sent' && (
        <div className="success" role="status" data-testid="success-message">
          Thanks. Your message is on its way. I reply within two working days.
        </div>
      )}
    </div>
  );
}
