class APIFeatures {
  constructor(query, queryString) {
    this.query = query;
    this.queryString = queryString;
  }

  //Filtering
  filter() {
    //Copy query strings object
    const queryObject = { ...this.queryString };
    //Create array of fields unrelated to filtering
    const excludedFields = [
      'page',
      'sort',
      'limit',
      'fields',
      'loc',
      'paginate',
    ];
    //Delete unrelated fields from queryObject
    excludedFields.forEach((field) => delete queryObject[field]);

    //Stringify query object for acdess to replace method
    let queryStr = JSON.stringify(queryObject);
    //Insert $ before any matches of Mongo query comparison operators
    queryStr = queryStr.replace(/\b(gte|gt|lte|lt)\b/g, (match) => `$${match}`);

    //Convert back to JSON and add to query
    this.query = this.query.find(JSON.parse(queryStr));

    return this;
  }

  //Sorting
  sort() {
    if (this.queryString.sort) {
      //replace commas in sort string with spaces
      const sortBy = this.queryString.sort.replace(/,/g, ' ');
      this.query = this.query.sort(sortBy);
    } else {
      //If no sort string, sort by created date descending
      this.query = this.query.sort('-createdAt');
    }

    return this;
  }

  //Selecting
  limit() {
    if (this.queryString.fields) {
      const fields = this.queryString.fields.replace(/,/g, ' ');
      this.query = this.query.lean().select(fields);
    } else {
      this.query = this.query.lean().select('-__v');
    }

    return this;
  }

  loc() {
    if (this.queryString.loc) {
      const location = JSON.parse(this.queryString.loc);

      const radius = location.radius / 3963.2;
      const center = location.center.split(',');

      if (center && radius) {
        const area = { center, radius, spherical: true };
        this.query = this.query.where('location').within().circle(area);
      }
    }

    return this;
  }

  //Pagination
  // paginate() {

  //   this.query = this.query.skip(skip).limit(limit);

  //   return this;
  // }
}

module.exports = APIFeatures;
