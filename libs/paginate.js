module.exports = async (Model, query, queryString) => {
  const pagination = JSON.parse(queryString.paginate);
  const page = Number(pagination.page) || 1;
  const limit = Number(pagination.limit) || 10;

  const response = await Model.paginate(query, {
    page,
    limit,
    //handle projection in mongoose-paginate to avoid path collision
    select: queryString.fields
      ? queryString.fields.replace(/,/g, ' ')
      : undefined,
  });

  return response;
};
