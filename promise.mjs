"use strict"

import queueMacrotask from './queuemacrotask.mjs';

class promise {
    #executor;
    #executorCalled;
    #resolveCallback;
    #resolveCallbackCalled;
    #rejectCallback;
    #rejectCallbackCalled;
    #result;
    #error;

    constructor(executor) {

        this.#executor = executor;
        this.#executorCalled = false;

        this.#resolveCallback = null;
        this.#resolveCallbackCalled = false;

        this.#rejectCallback = null;
        this.#rejectCallbackCalled = false;

        this.#result = null;
        this.#error = null;
    }

    then(resolveCallback, rejectCallback = () => { }) {

        // Save the Callbacks
        this.#resolveCallback = resolveCallback;
        this.#rejectCallback = rejectCallback;

        queueMicrotask(() => {

            // Because catch just forwards the call to then,
            // we need to ensure that the executor is not called twice
            if (this.#executorCalled) {
                return;
            }

            this.#executor(this.#resolver.bind(this), this.#rejecter.bind(this));
            this.#executorCalled = true;

            if (this.#result !== null) {
                this.#resolveCallback(this.#result);
                return;
            }

            else if (this.#error !== null) {
                this.#rejectCallback(this.#error);
                return;
            }

            // At this point, we know that the promise has not yet been resolved
            // It could be that the portion of the code that is supposed to resolve 
            // our promise, has been placed on the macro or micro task queue.
            // Hence we need to also place our promise's resolve checker on the macro task queue
            queueMacrotask(() => this.#resolvePromiseAfterDelayedResolution());
        });

        return this;
    }

    catch(rejectCallback) {
        return this.then(this.#resolveCallback ? this.#resolveCallback : () => { }, rejectCallback);
    }

    static resolve(result) {
        return new promise((resolve) => {
            resolve(result);
        });
    }

    static reject(error) {
        return new promise((_, reject) => {
            reject(error);
        });
    }

    static all(promises) {
        let results = [];
        let errors = [];
        return new promise((resolve, reject) => {
            promises.forEach(promise => promise.then(results.push.bind(results)).catch(errors.push.bind(errors)));

            // Add the all-promises-resolved-checker onto the macrotask queue
            // This promise will be resolved only when all other promises have been resolved
            queueMacrotask(() => promise.#allPromisesResolved(promises.length, results, errors, resolve, reject));
        });
    }

    static any(promises) {
        let results = [];
        let errors = [];
        return new promise((resolve, reject) => {
            promises.forEach(promise => promise.then(results.push.bind(results)).catch(errors.push.bind(errors)));

            queueMacrotask(() => promise.#allPromisesRejected(promises.length, results, errors, resolve, reject));
        });
    }

    static race(promises) {
        let results = [];
        let errors = [];
        return new promise((resolve, reject) => {
            promises.forEach(promise => promise.then(results.push.bind(results)).catch(errors.push.bind(errors)));

            queueMacrotask(() => promise.#atLeastOnePromiseResolved(results, errors, resolve, reject));
        });
    }

    static allSettled(promises) {
        let results = [];
        let errors = [];
        return new promise((resolve) => {
            promises.forEach(
                (promise, index) =>
                    promise.then((result) => this.#addResultToSettledResults(result, index, results))
                        .catch((error) => this.#addErrorToSettledErrors(error, index, errors))
            );

            queueMacrotask(() => promise.#allPromisesSettled(promises.length, results, errors, resolve));
        });
    }

    #resolver(result) {
        this.#result = result;
    }

    #rejecter(error) {
        this.#error = error;
    }

    static #allPromisesResolved(count, results, errors, resolve, reject) {
        // This function essentially just checks whether the results(no. of resolved promises) is equal to the number of
        // promises that were given. If so, it resolves the 'wrapper' promise.
        // If there is any rejected promise, it rejects the 'wrapper' promise.
        // Otherwise, it just requeues an instance of itself

        if (count === results.length) {
            resolve(results);
            return;
        }
        else if (errors.length) {
            reject(errors[0]);
            return;
        }
        else
            queueMacrotask(() => this.#allPromisesResolved(count, results, errors, resolve, reject));
    }

    static #allPromisesRejected(count, results, errors, resolve, reject) {
        if (count === errors.length) {
            reject(errors);
            return;
        }
        else if (results.length) {
            resolve(results[0]);
            return;
        }
        else
            queueMacrotask(() => this.#allPromisesRejected(count, results, errors, resolve, reject));
    }

    static #atLeastOnePromiseResolved(results, errors, resolve, reject) {
        if (results.length) {
            resolve(results[0]);
            return;
        }
        else if (errors.length) {
            reject(errors[0]);
            return;
        }
        else
            queueMacrotask(() => this.#atLeastOnePromiseResolved(results, errors, resolve, reject));
    }

    static #allPromisesSettled(count, results, errors, resolve) {
        if (count === (results.length + errors.length)) {
            // All promises have been settled
            let allResultsAndErrors = [...results, ...errors];
            allResultsAndErrors.sort((a, b) => a.index - b.index);

            resolve(allResultsAndErrors);
            return;
        }
        else
            queueMacrotask(() => this.#allPromisesSettled(count, results, errors, resolve));
    }

    #resolvePromiseAfterDelayedResolution() {
        // Within this function, we need to check whether the promise has been resolved.
        // If so, we just call the correct callback and return

        if (this.#result !== null) {
            // Ensure that the resolve or reject callback is not called more that once
            if (!this.#resolveCallbackCalled && !this.#rejectCallbackCalled) {
                this.#resolveCallback(this.#result);
                this.#resolveCallbackCalled = true;
            }
            return;
        }
        else if (this.#error !== null) {
            if (!this.#resolveCallbackCalled && !this.#rejectCallbackCalled) {
                this.#rejectCallback(this.#error);
                this.#rejectCallbackCalled = true;
            }
            return;
        }

        // If we reach this point once more, we know that the promise has not yet been resolved or rejected
        // so we requeue our resolution checker
        queueMacrotask(() => this.#resolvePromiseAfterDelayedResolution());
    }

    static #addResultToSettledResults(result, index, results) {
        results.push({
            index: index,
            status: "fulfilled",
            result: result
        });
        return;
    }

    static #addErrorToSettledErrors(error, index, errors) {
        errors.push({
            index: index,
            status: "rejected",
            error: error
        });
        return;
    }
}

export default promise;