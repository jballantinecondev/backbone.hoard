'use strict';

var Hoard = require('src/backbone.hoard');
var Store = require('src/store');
var Policy = require('src/policy');
var Backbone = require('backbone');
var ReadStrategy = require('src/read-strategy');
var Helpers = require('src/strategy-helpers');

describe("Read Strategy", function () {
  beforeEach(function () {
    this.store = new Store();

    this.policy = new Policy();
    this.key = 'key';
    this.sinon.stub(this.policy, 'getKey').returns(this.key);

    this.Model = Backbone.Model.extend({ url: this.key });
    this.model = new this.Model();
    this.sinon.spy(this.model, 'sync');

    this.options = {
      success: this.sinon.stub(),
      error: this.sinon.stub()
    };

    this.strategy = new ReadStrategy({
      store: this.store,
      policy: this.policy
    });
  });

  describe("on a cache miss", function () {
    beforeEach(function () {
      this.cacheResponse = Hoard.Promise.reject();
      this.sinon.stub(this.store, 'get').returns(this.cacheResponse);

      this.setPromise = Hoard.Promise.resolve();
      this.sinon.stub(this.store, 'set').returns(this.setPromise);
      this.sinon.stub(this.store, 'invalidate');

      this.metadata = { myMeta: true};
      this.serverResponse = { myResponse: true };
      this.sinon.stub(this.policy, 'getMetadata').returns(this.metadata);

      this.execution = this.strategy.execute(this.model, this.options);
    });

    it("returns a promise that resolves when the get and sync resolve", function (done) {
      this.ajax.resolve(this.serverResponse);
      this.execution.then(done);
    });

    it("writes a placeholder until the sync resolves", function (done) {
      var spec = this;
      this.setPromise.then(function () {
        expect(spec.store.set).to.have.been.calledOnce
          .and.calledWith(spec.key, { placeholder: true });
        done();
      });
    });

    it("writes to the cache on a successful sync", function (done) {
      var spec = this;
      this.ajax.resolve(this.serverResponse);
      this.strategy.on(Helpers.getSyncSuccessEvent(this.key), function () {
        expect(spec.store.set).to.have.been.calledTwice
          .and.calledWith(spec.key, spec.serverResponse, spec.metadata);
        done();
      });
    });

    it("invalidates the cache on a failed sync", function (done) {
      var spec = this;
      this.ajax.reject(this.serverResponse);
      this.strategy.on(Helpers.getSyncErrorEvent(this.key), function () {
        expect(spec.store.invalidate).to.have.been.calledOnce
          .and.calledWith(spec.key);
        done();
      });
    });
  });

  describe("on an expired cache hit", function () {
    beforeEach(function () {
      this.getPromise = Hoard.Promise.resolve();
      this.sinon.stub(this.store, 'get').returns(this.getPromise);
      this.sinon.stub(this.policy, 'shouldEvictItem').returns(true);
      this.invalidated = Hoard.Promise.resolve();
      this.sinon.stub(this.store, 'invalidate').returns(this.invalidated);
      var cacheMissed = this.cacheMissed = Hoard.defer();
      this.sinon.stub(this.strategy, 'onCacheMiss', function () {
        cacheMissed.resolve();
        return cacheMissed.promise;
      });
      this.execution = this.strategy.execute(this.model, this.options);
    });

    it("invalidates the cache", function (done) {
      var spec = this;
      this.getPromise.then(function () {
        expect(spec.store.invalidate).to.have.been.calledOnce
          .and.calledWith(spec.key);
        done();
      });
    });

    it("acts as a cache miss", function (done) {
      var spec = this;
      this.cacheMissed.promise.then(function () {
        expect(spec.strategy.onCacheMiss).to.have.been.calledOnce
          .and.calledWith(spec.key, spec.model, spec.options);
        done();
      });
    });
  });

  describe("on a placeholder cache hit", function () {
    beforeEach(function () {
      this.getPromise = Hoard.Promise.resolve({ placeholder: true });
      this.sinon.stub(this.store, 'get').returns(this.getPromise);
      this.serverResponse = { myResponse: true };
      this.execution = this.strategy.execute(this.model, this.options);
    });

    it("calls options.success on a successful cache event", function (done) {
      var spec = this;
      this.getPromise.then(function () {
        spec.strategy.trigger(Helpers.getSyncSuccessEvent(spec.key), spec.serverResponse);
      });
      this.execution.then(function () {
        expect(spec.options.success).to.have.been.calledOnce
          .and.calledWith(spec.serverResponse);
        done();
      });
    });

    it("calls options.error on an error cache event", function (done) {
      var spec = this;
      this.getPromise.then(function () {
        spec.strategy.trigger(Helpers.getSyncErrorEvent(spec.key), spec.serverResponse);
      });
      this.execution.then(this.sinon.stub(), function () {
        expect(spec.options.error).to.have.been.calledOnce
          .and.calledWith(spec.serverResponse);
        done();
      });
    });
  });

  describe("on a cache hit", function () {
    beforeEach(function () {
      this.cacheItem = { data: {} };
      this.sinon.stub(this.store, 'get').returns(Hoard.Promise.resolve(this.cacheItem));
      this.sinon.stub(this.policy, 'shouldEvictItem').returns(false);
      this.execution = this.strategy.execute(this.model, this.options);
    });

    it("calls options.success with the retreived item", function (done) {
      var spec = this;
      this.execution.then(function () {
        expect(spec.options.success).to.have.been.calledOnce
          .and.calledWith(spec.cacheItem.data);
        done();
      });
    });
  });
});
