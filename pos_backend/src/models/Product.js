export default class Product {
  constructor({
    id,
    codigoProd,
    codigoAltern,
    nombreProd,
    price = 0,
    stock = 0,
    org_id = 1,
    id_category = 1,
    description = '',
    image = ''
  } = {}) {
    this.id = id;
    this.codigoProd = codigoProd;
    this.codigoAltern = codigoAltern;
    this.nombreProd = nombreProd;
    this.price = Number(price) || 0;
    this.stock = Number(stock) || 0;
    this.org_id = org_id;
    this.id_category = id_category;
    this.description = description;
    this.image = image;
  }
}
