document.querySelectorAll('.status-card').forEach((card) => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.status-card').forEach((item) => {
      item.classList.remove('selected');
      item.setAttribute('aria-checked', 'false');
    });
    card.classList.add('selected');
    card.setAttribute('aria-checked', 'true');
  });
});

document.querySelector('.theme-button').addEventListener('click', () => {
  document.body.classList.toggle('dark');
});

document.querySelectorAll('.login-button, .check-button').forEach((button) => {
  button.addEventListener('click', () => {
    window.location.href = 'login.html';
  });
});
