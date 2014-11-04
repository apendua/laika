describe('Benchmark test suite', function () {

  it('should just work', function (done, server, client) {
    client.eval(function () {
      emit('done', 1, 2, 3);
    }, 1, 2, 3, function (err, result) {
      console.log(err);
      console.log(result);
      
      client._browser.log('browser', function (err, logs) {
        console.log(err, logs);
      });
    });

    client.once('done', function () {
      console.log(arguments);
      done();
    });
  });

  it('should work again', function (done, server, client) {
    client.eval(function () {
      emit('done', 1, 2, 3);
    }, 1, 2, 3, function (err, result) {
      console.log(err);
      console.log(result);
      
      client._browser.log('browser', function (err, logs) {
        console.log(err, logs);
      });
    });

    client.once('done', function () {
      console.log(arguments);
      done();
    });
  });

  it('should be able to use async functions', function (done, server, client) {
    client.once('pageOpened', function () {
      client._browser.executeAsync(function (cb) {
        setTimeout(cb, 2000);
      }, function (err) {
        console.log('LOL', err);
        done();
      });

    });

  });

});
