export default class User {
  constructor({
    id,
    username,
    password,
    nombre = '',
    apellido = '',
    email = '',
    numeroEmpleado = 0,
    role = 'admin',
    activo = true,
    photo = ''
  } = {}) {
    this.id = id;
    this.username = username;
    this.password = password;
    this.nombre = nombre;
    this.apellido = apellido;
    this.email = email;
    this.numeroEmpleado = numeroEmpleado;
    this.role = role;
    this.activo = activo;
    this.photo = photo;
  }

  static fromDbRow(row = {}) {
    return new User({
      id: row.id,
      username: row.username,
      password: row.password,
      nombre: row.nombre || '',
      apellido: row.apellido || '',
      email: row.email || '',
      numeroEmpleado: Number(row.numero_empleado || 0),
      role: row.role || 'admin',
      activo: Boolean(row.activo),
      photo: row.photo || ''
    });
  }

  get fullName() {
    return `${this.nombre || ''} ${this.apellido || ''}`.trim() || this.username;
  }
}
