// Configuración pública de Firebase (no es secreta: la seguridad la dan las reglas de Firestore).
// La tienda lee de aquí el proyecto; el panel de admin además usa apiKey/authDomain para el login.
(function () {
  var local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  var projectId = 'the-white-hilux';
  var region = 'southamerica-east1';
  window.TWH_FIREBASE = {
    projectId: projectId,
    apiKey: 'AIzaSyD2sgY3mZ40UDBr8U7PjVgZkEYp9-an5Ek',
    authDomain: projectId + '.firebaseapp.com',
    appId: '1:136217882027:web:380ec5a3021333de07f6ee',
    // Correos con acceso al panel (deben coincidir con firestore.rules)
    admins: ['tmontes30@gmail.com'],
    // Clave pública para las notificaciones push del panel (la privada está en la bóveda de Firebase)
    vapidPublicKey: 'BCZjVniQDpf60yzmP0LEKn3k4dBpWN4WMN29B8ZN-KYDPRI8ygiEX5tgAEnvEwIVqZwuf8RkH1wRgh3YPdSvtvo',
    // Al abrir la tienda en localhost se usan los emuladores de Firebase (pruebas sin tocar datos reales)
    useEmulators: local,
    apiBase: local ? 'http://127.0.0.1:5001/' + projectId + '/' + region : 'https://' + region + '-' + projectId + '.cloudfunctions.net'
  };
})();
