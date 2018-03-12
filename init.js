(() => {
  Array.prototype.groupBy = function(fn) {
    let obj = {};
    this.forEach((item) => {
      try {
        let key = fn instanceof Function ? fn(item) : item[fn];
        if (!obj[key]) {
          obj[key] = []
        }
        obj[key].push(item);
      } catch (err) {
        console.warn(item, fn);
      }
    });
    return obj;
  };

  Array.prototype.keyBy = function(fn) {
    let obj = {};
    this.forEach((item) => {
      try {
        let key = fn instanceof Function ? fn(item) : item[fn];
        obj[key] = item;
      } catch (err) {
        console.warn(item, fn);
      }
    });
    return obj;
  };


  window.HttpTransport = class HttpTransport {
    constructor(endpoint, params = {}) {
      this.endpoint = endpoint;
      this.params = Object.assign({
        credentials: 'include',
        headers: { "Content-type": "application/json; charset=UTF-8" }
      }, params)
    }
    async status(res) {
      if ([200, 201].includes(res.status)) {
        return res.json()
      } else {
        try {
          let r = await res.json();
          return Promise.reject(r)
        } catch (err) {
          return res
        }
      }
    }
    async c(url, data) {
      return fetch(`${this.endpoint}/${url}`, {
        credentials: this.params.credentials,
        method: 'post',
        headers: this.params.headers,
        body: JSON.stringify(data)
      }).then(this.status)
    }
    async r(url, where = {}) {
      return fetch(`${this.endpoint}/${url}?q=${JSON.stringify(where)}`, {
        credentials: this.params.credentials,
        headers: this.params.headers
      }).then(this.status)
    }
    async u(url, data) {
      return fetch(`${this.endpoint}/${url}`, {
        credentials: this.params.credentials,
        method: 'put',
        headers: this.params.headers,
        body: JSON.stringify(data)
      }).then(this.status)
    }
    //where использовать вовсе не обязательно. можно использовать урлы вида /api/orders/1
    async d(url, data) {
      return fetch(`${this.endpoint}/${url}`, {
        credentials: this.params.credentials,
        method: 'delete',
        headers: this.params.headers,
        body: JSON.stringify(data)
      }).then(this.status)
    }
  };



  let models = {};

  models.Model = class Model {
    constructor(properties = {}, options) {
      Object.assign(this, properties);
      if (options) {
        Object.keys(options).forEach((prop) => {
          Object.defineProperty(this, prop, {
            value: options[prop]
          });
        });
      }

      if (this.constructor.schema.sendOnlyUpdates) {
        let value = Object.assign({}, this);
        Object.keys(value).forEach((prop) => {
          if (value[prop] instanceof Object) {
            value[prop] = JSON.stringify(value[prop]);
          }
        })
        Object.defineProperty(this, '_initial', { value })
      }
    }

    toJSON() {
      let result = { _id: this._id };
      if (this.constructor.schema.sendOnlyUpdates) {
        Object.keys(this).forEach((prop) => {
          if (this[prop] instanceof Object) {
            if (JSON.stringify(this[prop]) !== this._initial[prop]) {
              result[prop] = this[prop];
            }
          } else {
            if (this[prop] !== this._initial[prop]) {
              result[prop] = this[prop];
            }
          }
        });
      } else {
        result = Object.assign(result, this);
      }
      return result;
    }

    save() {
      return this.constructor.sync(
        this.constructor.schema.name,
        this._id ? 'update' : 'create',
        this.toJSON()
      ).then((result) => {
        Object.assign(this, result);
        return this;
      });
    }

    'delete' () {
      return this.constructor.sync(this.constructor.schema.name, 'delete', this.toJSON());
    }

    static read(where = {}, options, connections) {
      if (this.schema.safeDelete && !where.hasOwnProperty('deleted')) {
        where.deleted = {
          $ne: true
        };
      }
      return this.sync(this.schema.name, 'read', {}, where, options, connections).then((loaded) => loaded.map((obj) => {
        let item = new this(obj);
        ['connections', 'breadcrumbs'].forEach((key) => {
          if (item[key]) {
            let value = item[key];
            delete item[key];
            Object.defineProperty(item, key, {
              value: value
            });
          }
        });
        return item;
      }));
    }

    static count(where) {
      return this.sync(this.schema.name, 'count', {}, where);
    }

    static sync(collection, method, data, where, options, connections) {
      //if (socket.connected) {
      return new Promise((resolve, reject) => {
        this.transport.emit('data:' + method, { collection, data, where, options, connections }, (data) => {
          if (data.hasOwnProperty('error')) {
            reject(data.error);
          } else {
            resolve(data);
          }
        });
      });
      //} else {
      //  return Promise.reject("socket disconnected");
      //}
    }
    static get transport() {
      return window.socket;
    }
    static get schema() {}
  };

  models.Tree = class Tree extends models.Model {
    static breadcrumb(id) {
      return this.sync(this.schema.name, 'breadcrumb', {}, {
        _id: id
      }).then((loaded) => loaded.map((obj) => {
        let item = new this(obj);
        if (item.connections) {
          let connections = item.connections;
          delete item.connections;
          Object.defineProperty(item, 'connections', {
            value: connections
          });
        }
        return item;
      }));
    }
  };

  models.User = class User extends models.Model {
    static get schema() {
      return schemas.User;
    }
    permission(permissionString) {
      return this.permissions.includes(permissionString) || this.permissions.includes('full access');
    }
  };

  models.Schema = class Schema {
    constructor(schema = {}) {
      Object.assign(this, schema);
    }

    forEach(fn, schema) {
      schema = schema || this;
      fn(schema);
      if (schema.type === 'object') {
        Object.keys(schema.properties).forEach((key) => {
          this.forEach(fn, schema.properties[key]);
        });
      } else if (schema.type === 'array') {
        this.forEach(fn, schema.items);
      }
    }

    getField(path) {
      const arr = path.split('.').reduce((prev, cur) => prev.concat(['properties', cur]), []);
      return arr.reduce((prev, cur) => prev ? prev[cur] : null, this);
    }
  }

  window.models = models;

  window.util = window.util || {};

  Object.assign(window.util, {
    notify: (data, duration) => {
      let el = util.dom.el('paper-toast', {
        attributes: {
          duration: duration || 10000
        }
      }, data instanceof Object ? data.body : data);
      document.body.appendChild(el);
      setTimeout(function() {
        el.open();
      }, 100);
    },
    dom: {
      el: (name, properties = {}, children = null) => {
        properties = properties || {};
        let el = document.createElement(name);
        if (properties.attributes) {
          for (let key in properties.attributes) {
            el.setAttribute(key, properties.attributes[key]);
          }
          delete properties.attributes;
        }
        Object.assign(el, properties);
        if (children) {
          if (typeof children === 'string') {
            el.innerHTML = children;
          } else if (children instanceof Array) {
            children.forEach((item) => {
              el.appendChild(item);
            });
          } else {
            el.appendChild(children);
          }
        }
        return el;
      }
    }
  });

})()

window.init = () => {
  return Promise.all([
    fetch('/init', {
      credentials: 'include'
    }).then((response) => response.json()),
    new Promise((resolve, reject) => {
      window.wcPolyfill ? document.addEventListener('WebComponentsReady', () => resolve()) : resolve();
    })
  ]).then(([init]) => {
    Object.keys(init.schemas).forEach((key) => init.schemas[key] = new models.Schema(init.schemas[key]));
    window.schemas = init.schemas;
    for (let key in schemas) {
      if (!models[key]) {
        if (schemas[key].tree) {
          models[key] = class extends models.Tree {
            static get schema() {
              return schemas[key];
            }
          }
        } else {
          models[key] = class extends models.Model {
            static get schema() {
              return schemas[key];
            }
          }
        }
      }
    }
    window.user = new models.User(init.user);
    window.socket = io();
    return init;
  }).catch((err) => {
    console.error(err);
  });
}
