module.exports = (list, allowedList) => {
  if (!list) {
    return undefined;
  }

  const listArray = list.split(',');
  const allowedMap = allowedList
    .split(',')
    .reduce((acc, el) => ({ ...acc, [el]: true }), {});

  const newListArray = listArray.filter((el) => allowedMap[el]);
  const newList = newListArray.join(',');
  return newList;
};
