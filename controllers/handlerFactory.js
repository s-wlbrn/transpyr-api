const asyncCatch = require('../libs/asyncCatch');
const AppError = require('../libs/AppError');
const APIFeatures = require('../libs/apiFeatures');

//One document

exports.createOne = (Model) =>
  asyncCatch(async (req, res, next) => {
    const doc = await Model.create(req.body);

    res.status(201).json({
      status: 'success',
      data: {
        data: doc,
      },
    });
  });

exports.getOne = (Model) =>
  asyncCatch(async (req, res, next) => {
    const queryFeatures = new APIFeatures(
      Model.findById(req.params.id),
      req.query
    ).limit();
    //populate?
    const doc = await queryFeatures.query;

    if (!doc) {
      return next(new AppError('Resource not found.', 404));
    }

    res.status(200).json({
      status: 'success',
      data: {
        data: doc,
      },
    });
  });

exports.updateOne = (Model) =>
  asyncCatch(async (req, res, next) => {
    //possibly move
    if (req.file) req.body.photo = req.file.filename;
    const doc = await Model.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
      context: 'query',
    });

    if (!doc) {
      return next(new AppError('Resource not found.', 404));
    }

    res.status(200).json({
      status: 'success',
      data: {
        data: doc,
      },
    });
  });

exports.deleteOne = (Model) =>
  asyncCatch(async (req, res, next) => {
    const doc = await Model.findByIdAndDelete(req.params.id);

    if (!doc) {
      return next(new AppError('Resource not found.', 404));
    }

    res.status(204).json({
      status: 'success',
      data: null,
    });
  });

//All documents

exports.getAll = (Model) =>
  asyncCatch(async (req, res, next) => {
    const queryFeatures = new APIFeatures(Model.find(), req.query)
      .filter()
      .sort()
      //.limit()
      .loc();

    let documents = [];
    let data = {};
    //pagination
    if (req.query.paginate) {
      const pagination = JSON.parse(req.query.paginate);
      const page = Number(pagination.page) || 1;
      const limit = Number(pagination.limit) || 10;

      const response = await Model.paginate(queryFeatures.query, {
        page,
        limit,
        //handle projection in mongoose-paginate to avoid path collision
        select: req.query.fields.replace(/,/g, ' '),
      });
      documents = response.docs;

      const { total, pages } = response;
      data = {
        data: documents,
        total,
        page,
        pages,
      };
    } else {
      queryFeatures.limit();
      documents = await queryFeatures.query;
      data = {
        data: documents,
      };
    }

    res.status(200).json({
      status: 'success',
      results: documents.length,
      data,
    });
  });
