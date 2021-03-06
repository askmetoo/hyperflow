var spawn = require('child_process').spawn;
var log4js = require('log4js');


// Spawns a job "node handler.js" and waits for the notification of its
// completion using the Redis job status notification mechanism
async function submitRemoteJob(ins, outs, context, cb) {
  let fname='wftrace-' + context.hfId + '-' + context.appId + '.log';
  log4js.configure({
    appenders: { hftrace: { type: 'file', filename: fname } },
    categories: { default: { appenders: ['hftrace'], level: 'error' } }
  });

  var logger = log4js.getLogger();

  logger.level = 'debug';
  console.log("Spawning process...");

  //console.log(ins.map(i => i));

  var input_dir = context.command.input_dir,
      work_dir = context.command.work_dir,
      output_dir = context.command.output_dir;
    
  let jobMessage = JSON.stringify({
    "executable": context.command.executable,
    "args": context.command.args,
    "env": context.command.env || {},
    "input_dir": input_dir, // input data files
    "work_dir": work_dir, // working directory
    "output_dir": output_dir, // if present, copy output files there
    "inputs": ins.map(i => i),
    "outputs": outs.map(o => o),
    "stdout": context.command.stdout, // if present, denotes file name to which stdout should be redirected
    "redis_url": context.redis_url,
    "taskId": context.taskId
  });

  //console.log(jobMessage.inputs, jobMessage.outputs);

  var cmd;

  // if 'container' is present, run through Docker, mounting all directories if necessary
  if (context.container) {
    cmd = 'docker run ';
    if (input_dir) cmd += ' -v ' + input_dir + ':/input_dir ';
    if (work_dir) cmd += ' -v ' + work_dir + ':/work_dir ';
    if (output_dir) cmd += ' -v ' + output_dir + ':/output_dir ';
    cmd += container + ' node';
  } else cmd = 'node'

  try {
    if (work_dir) { process.chdir(work_dir); }
  } catch (error) {
    throw error;
  }

  // "submit" job (start the handler process)
  var proc = spawn(cmd, ['handler1.js', context.taskId, context.redis_url], {shell: true});

  proc.stderr.on('data', function(data) {
    logger.debug(data.toString());
    console.log(data.toString());
  });

  proc.stdout.on('data', function(data) {
    logger.debug(data.toString());
    console.log(data.toString());
  });

  proc.on('exit', function(code) {
    logger.debug('Process exited with code', code);
  });

  // send message to the job (command to be executed)
  try {
    await context.sendMsgToJob(jobMessage);
    logger.info('[' + context.taskId + '] job message sent');
  } catch(err) {
    console.error(err);
    throw err;
  }

  // wait for the job to finish (timeout=0 means indefinite)
  try {
    var jobResult = await context.jobResult(0);
    logger.info('[' + context.taskId + '] job result received:', jobResult);
    console.log('Received job result:', jobResult);
    cb(null, outs);
  } catch(err) {
    console.error(err);
    throw err;
  }
}

exports.submitRemoteJob = submitRemoteJob;
