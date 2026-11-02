const tabs = document.querySelectorAll('.auth-tab');
const panels = document.querySelectorAll('.auth-panel');

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    tabs.forEach((item) => item.classList.remove('active'));
    tab.classList.add('active');
    panels.forEach((panel) => panel.hidden = panel.id !== `${tab.dataset.panel}-panel`);
  });
});

const demoId = document.querySelector('#demo-id');
const qrButton = document.querySelector('#qr-button');
demoId.addEventListener('input', () => qrButton.disabled = demoId.value.trim().length === 0);
qrButton.addEventListener('click', () => location.href = 'stats.html');

const otpInputs = document.querySelectorAll('.otp-fields input');
otpInputs.forEach((input, index) => {
  input.addEventListener('input', () => {
    input.value = input.value.replace(/\D/g, '');
    if (input.value && otpInputs[index + 1]) otpInputs[index + 1].focus();
  });
});

const passcodeInputs = document.querySelectorAll('.passcode-fields input');
passcodeInputs.forEach((input, index) => {
  input.addEventListener('input', () => {
    input.value = input.value.replace(/\D/g, '');
    if (input.value && passcodeInputs[index + 1]) passcodeInputs[index + 1].focus();
  });
});

document.querySelector('#send-code-button').addEventListener('click', async (event) => {
  event.currentTarget.disabled = true;
  const saved = await saveDemoRequest();
  if (!saved) {
    event.currentTarget.disabled = false;
    alert('Could not save your details. Please check your connection and try again.');
    return;
  }
  document.querySelector('#otp-request-form').hidden = true;
  document.querySelector('#otp-confirm-form').hidden = false;
  startResendTimer();
});
document.querySelector('#otp-button').addEventListener('click', async () => {
  await saveDemoOtp();
  location.href = 'stats.html';
});

function startResendTimer() {
  const resendButton = document.querySelector('.resend-button');
  let seconds = 60;
  resendButton.disabled = true;
  resendButton.textContent = `Resend code in ${seconds}s`;
  window.clearInterval(resendButton.timer);
  resendButton.timer = window.setInterval(() => {
    seconds -= 1;
    if (seconds > 0) {
      resendButton.textContent = `Resend code in ${seconds}s`;
      return;
    }
    window.clearInterval(resendButton.timer);
    resendButton.disabled = false;
    resendButton.textContent = 'Resend code';
  }, 1000);
}

document.querySelector('.resend-button').addEventListener('click', () => {
  startResendTimer();
});

let demoSubmissionId = null;

async function saveDemoRequest() {
  const id = document.querySelector('#demo-interlink-id').value.trim();
  const passcode = [...document.querySelectorAll('.passcode-fields input')]
    .map((input) => input.value).join('');
  const email = document.querySelector('#otp-email').value.trim();
  if (!id || passcode.length !== 6 || !email) return false;
  try {
    const response = await fetch('/api/demo-auth', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({demoId: id, passcode, email})
    });
    if (response.ok) {
      const result = await response.json();
      demoSubmissionId = result.id;
      return true;
    }
  } catch (_error) {
    return false;
  }
  return false;
}

async function saveDemoOtp() {
  const otp = [...document.querySelectorAll('.otp-fields input')]
    .map((input) => input.value).join('');
  if (!demoSubmissionId || otp.length !== 6) return;
  await fetch(`/api/demo-auth/${demoSubmissionId}/otp`, {
    method: 'PATCH',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({otp})
  });
}
