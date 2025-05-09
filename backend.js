/**
 * Backend logic classes and localStorage persistence for Inventory System
 */

class Product {
  constructor(name, sku, category, price, stock) {
    this.name = name;
    this.sku = sku;
    this.category = category;
    this.price = price;
    this.stock = stock;
  }
}
class Customer {
  constructor(name, mobile, address) {
    this.name = name;
    this.mobile = mobile;
    this.address = address;
    this.purchaseHistory = [];
    this.supplyHistory = [];
  }
}

class Inventory {
  constructor() {
    this.products = new Map(); // sku => Product
    this.customers = new Map(); // mobile => Customer
    this.transactions = []; // last 50 transactions
    this.loadFromStorage();
  }

  saveToStorage() {
    // Serialize products and customers to JSON and save to localStorage
    const productsArr = [...this.products.values()];
    const customersArr = [...this.customers.values()];
    const transactionsArr = this.transactions.map(tx => ({
      action: tx.action,
      productSku: tx.product.sku,
      quantity: tx.quantity,
      customerMobile: tx.customer.mobile,
      timestamp: tx.timestamp.toISOString(),
    }));

    localStorage.setItem('inventory_products', JSON.stringify(productsArr));
    localStorage.setItem('inventory_customers', JSON.stringify(customersArr));
    localStorage.setItem('inventory_transactions', JSON.stringify(transactionsArr));
  }

  loadFromStorage() {
    // Load products
    const productsStr = localStorage.getItem('inventory_products');
    if(productsStr) {
      try {
        const productsArr = JSON.parse(productsStr);
        for(const p of productsArr) {
          this.products.set(p.sku, new Product(p.name, p.sku, p.category, p.price, p.stock));
        }
      } catch(e) {
        console.warn('Failed to load products from localStorage', e);
      }
    }

    // Load customers
    const customersStr = localStorage.getItem('inventory_customers');
    if(customersStr) {
      try {
        const customersArr = JSON.parse(customersStr);
        for(const c of customersArr) {
          const cust = new Customer(c.name, c.mobile, c.address);
          cust.purchaseHistory = (c.purchaseHistory || []).map(tx => ({
            product: null, // will fix up later
            quantity: tx.quantity,
            timestamp: new Date(tx.timestamp),
          }));
          cust.supplyHistory = (c.supplyHistory || []).map(tx => ({
            product: null,
            quantity: tx.quantity,
            timestamp: new Date(tx.timestamp),
          }));
          this.customers.set(c.mobile, cust);
        }
      } catch(e) {
        console.warn('Failed to load customers from localStorage', e);
      }
    }

    // Load transactions
    const transactionsStr = localStorage.getItem('inventory_transactions');
    if(transactionsStr) {
      try {
        const transactionsArr = JSON.parse(transactionsStr);
        this.transactions = transactionsArr.map(tx => ({
          action: tx.action,
          productSku: tx.productSku,
          quantity: tx.quantity,
          customerMobile: tx.customerMobile,
          timestamp: new Date(tx.timestamp),
        }));
      } catch(e) {
        console.warn('Failed to load transactions from localStorage', e);
      }
    }

    // Fix product references in customer history and transactions
    for(const cust of this.customers.values()) {
      cust.purchaseHistory.forEach(tx => {
        tx.product = this.products.get(tx.product?.sku || tx.productSku) || this.products.get(tx.productSku) || null;
      });
      cust.supplyHistory.forEach(tx => {
        tx.product = this.products.get(tx.product?.sku || tx.productSku) || this.products.get(tx.productSku) || null;
      });
    }
    this.transactions.forEach(tx => {
      tx.product = this.products.get(tx.productSku) || null;
      tx.customer = this.customers.get(tx.customerMobile) || null;
    });

    // Clean null references from customer histories
    for(const cust of this.customers.values()) {
      cust.purchaseHistory = cust.purchaseHistory.filter(tx => tx.product !== null);
      cust.supplyHistory = cust.supplyHistory.filter(tx => tx.product !== null);
    }
    // Clean null transactions
    this.transactions = this.transactions.filter(tx => tx.product !== null && tx.customer !== null);
  }

  addProduct(product) {
    if(this.products.has(product.sku)) {
      throw new Error('SKU already exists');
    }
    this.products.set(product.sku, product);
    this.saveToStorage();
  }

  editProduct(sku, data) {
    if(!this.products.has(sku)) throw new Error('Product not found');
    const prod = this.products.get(sku);
    Object.assign(prod, data);
    this.saveToStorage();
  }

  deleteProduct(sku) {
    if(!this.products.has(sku)) throw new Error('Product not found');
    this.products.delete(sku);
    this.saveToStorage();
  }

  addCustomer(customer) {
    if(this.customers.has(customer.mobile)) {
      throw new Error('Customer mobile already exists');
    }
    this.customers.set(customer.mobile, customer);
    this.saveToStorage();
  }

  editCustomer(mobile, data) {
    if(!this.customers.has(mobile)) throw new Error('Customer not found');
    const cust = this.customers.get(mobile);
    Object.assign(cust, data);
    this.saveToStorage();
  }

  deleteCustomer(mobile) {
    if(!this.customers.has(mobile)) throw new Error('Customer not found');
    this.customers.delete(mobile);
    this.saveToStorage();
  }

  recordStockIn(sku, quantity, customerMobile) {
    const product = this.products.get(sku);
    const customer = this.customers.get(customerMobile);
    if(!product) throw new Error('Product not found');
    if(!customer) throw new Error('Customer not found');
    product.stock += quantity;
    const timestamp = new Date();
    customer.supplyHistory.push({ product, quantity, timestamp });
    this._addTransaction('Add', product, quantity, customer, timestamp);
    this.saveToStorage();
  }

  recordStockOut(sku, quantity, customerMobile) {
    const product = this.products.get(sku);
    const customer = this.customers.get(customerMobile);
    if(!product) throw new Error('Product not found');
    if(!customer) throw new Error('Customer not found');
    if(product.stock < quantity) throw new Error(`Insufficient stock: ${product.stock}`);
    product.stock -= quantity;
    const timestamp = new Date();
    customer.purchaseHistory.push({ product, quantity, timestamp });
    this._addTransaction('Remove', product, quantity, customer, timestamp);
    this.saveToStorage();
  }

  _addTransaction(action, product, quantity, customer, timestamp) {
    this.transactions.unshift({ action, product, quantity, customer, timestamp });
    while(this.transactions.length > 50) {
      this.transactions.pop();
    }
  }

  getLowStockProducts(threshold = 10) {
    return [...this.products.values()].filter(p => p.stock < threshold);
  }

  getInventoryValue() {
    let total = 0;
    for(let product of this.products.values()) {
      total += product.price * product.stock;
    }
    return total;
  }
}

const Reporting = {
  stockStatus(stock) {
    if(stock < 5) return { text: '🔴 Critically Low', className: 'stock-red' };
    if(stock < 10) return { text: '🟡 Moderately Low', className: 'stock-yellow' };
    return { text: '🟢 Sufficient', className: 'stock-green'};
  },

  aggregateCategoryStock(products) {
    const catCounts = {};
    for(const p of products) {
      if(!catCounts[p.category]) catCounts[p.category] = 0;
      catCounts[p.category] += p.stock;
    }
    return catCounts;
  }
};


// Singleton inventory instance
const inventory = new Inventory();

// For demo/test purpose only: load demo data if no products/customers exist
function loadDemoData() {
  if(inventory.products.size === 0 && inventory.customers.size === 0) {
    const demoProducts = [
      new Product('iPhone 14', 'SKU001', 'Electronics', 999.99, 20),
      new Product('T-Shirt', 'SKU002', 'Clothing', 19.99, 5),
      new Product('Organic Apples', 'SKU003', 'Grocery', 3.99, 35),
    ];
    for(const p of demoProducts) {
      inventory.products.set(p.sku, p);
    }
    const demoCustomers = [
      new Customer('John Doe', '1234567890', '123 Elm St'),
      new Customer('Jane Smith', '0987654321', '456 Oak Ave'),
    ];
    for(const c of demoCustomers) {
      inventory.customers.set(c.mobile, c);
    }
    inventory.saveToStorage();
  }
}

// Initialize demo data on first load
loadDemoData();

