module.exports = (body, ...allowedFields) => {
  const newObj = {};
  Object.keys(body).forEach((el) => {
    if (allowedFields.includes(el)) newObj[el] = body[el];
  });
  return newObj;
};
