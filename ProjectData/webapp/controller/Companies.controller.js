sap.ui.define([
	"./BaseController",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/ui/model/Sorter",
	"sap/m/GroupHeaderListItem",
	"sap/ui/model/json/JSONModel",
	"sap/ui/Device",
	"../model/formatter",
	"sap/m/library"
], function (BaseController, Filter, FilterOperator, Sorter, GroupHeaderListItem, JSONModel, Device, formatter, mobileLibrary) {
	"use strict";

	return BaseController.extend("project.data.ProjectData.controller.Companies", {

		formatter: formatter,

		onInit: function () {
			var oViewModel = new JSONModel({
				busy: false,
				delay: 0,
				availableCompaniesListTitle: "",
				countCompanies: 0,
				selected: false
			});
			this.setModel(oViewModel, "companiesView");
			this.getRouter().getRoute("Companies").attachPatternMatched(this._onObjectMatched, this);
		},

		_onObjectMatched: function (oEvent) {
			this.onSearch();
		},

		onCompanyListUpdateFinished: function (oEvent) {
			this._updateCompanyListItemCount(oEvent.getParameter("total"));
		},

		_updateCompanyListItemCount: function (iTotalItems) {
			var sTitle;
			if (this.byId("companiesList").getBinding("items").isLengthFinal()) {
				sTitle = this.getResourceBundle().getText("availableCompaniesListTitle", [iTotalItems]);
				this.getModel("companiesView").setProperty("/availableCompaniesListTitle", sTitle);
			}
		},

		onCompanySelectionChange: function () {
			var aSelectedCompanies = this.byId("companiesList").getSelectedItems(),
				oViewModel = this.getModel("companiesView");
			if (aSelectedCompanies && aSelectedCompanies.length > 0) {
				oViewModel.setProperty("/selected", true);
			} else {
				oViewModel.setProperty("/selected", false);
			}
		},

		onRemoveCompany: function (oEvent) {
			var oDraggedItem = oEvent.getParameter("draggedControl"),
				oDraggedItemContext = oDraggedItem.getBindingContext();
			if (!oDraggedItemContext) {
				return;
			}

			var oModel = this.getModel(),
				oAppView = this.getModel("appView"),
				sPath = "/" + oModel.createKey("CompaniesForProjects", {
					ID: oDraggedItemContext.getProperty("ID")
				}),
				sCompanyID = oDraggedItemContext.getProperty("company_ID"),
				sDisciplineID = oDraggedItemContext.getProperty("discipline_ID"),
				aDisciplinesOfCompaniesFilter = [new Filter({
					filters: [
						new Filter("company_ID", FilterOperator.EQ, sCompanyID),
						new Filter("discipline_ID", FilterOperator.EQ, sDisciplineID)
					],
					and: true
				})],
				aExcludeIDs = oAppView.getProperty("/excludeDisciplineIDs"),
				that = this;

			// when sucessfully removed, find the DisciplinesOfCompanies entity that is no longer to be excluded from the list
			// because listupdatefinished in detail controller is too late
			oModel.remove(sPath, {
				success: function () {
					oModel.read("/DisciplinesOfCompanies", {
						filters: aDisciplinesOfCompaniesFilter,
						success: function (oData) {
							var index = aExcludeIDs.indexOf(oData.results[0].ID);
							if (index > -1) {
								aExcludeIDs.splice(index, 1);
								oAppView.setProperty("/excludeDisciplineIDs", aExcludeIDs);
								that.onSearch();
							}
						}
					})
				}
			});
		},

		onAssignCompanies: function () {
			var oList = this.byId("companiesList"),
				aSelectedCompanies = oList.getSelectedItems(),
				oViewModel = this.getModel("companiesView"),
				oAppView = this.getModel("appView"),
				oModel = this.getModel(),
				sProjectID = oAppView.getProperty("/selectedProjectID"),
				aExcludeDisciplineIDs = oAppView.getProperty("/excludeDisciplineIDs"),
				that = this;

			if (aSelectedCompanies.length === 0) {
				return;
			}
			this.getModel("companiesView").setProperty("/selected", false);
			aSelectedCompanies.reduce(function (v, oItem, i, aItems) {
				new Promise(function () {
					var oDisciplineForCompanyBC = oItem.getBindingContext(),
						sID = oDisciplineForCompanyBC.getProperty("ID"),
						sCompanyID = oDisciplineForCompanyBC.getProperty("company_ID"),
						sDisciplineID = oDisciplineForCompanyBC.getProperty("discipline_ID"),
						oCompanyForProject = {};
					oCompanyForProject.company_ID = sCompanyID;
					oCompanyForProject.project_ID = sProjectID;
					oCompanyForProject.discipline_ID = sDisciplineID;
					oModel.create("/CompaniesForProjects", oCompanyForProject, {
						success: function (oData) {
							// in case listupdatefinished in detail controller is too late
							aExcludeDisciplineIDs.push(sID);
							oAppView.setProperty("/excludeDisciplineIDs", aExcludeDisciplineIDs);
							if (i === aItems.length - 1) {
								that.onSearch();
							}
						},
						error: function () {
							oViewModel.setProperty("/busy", false);
						}
					});
				});
			}, Promise.resolve());
		},

		onSearch: function (oEvent) {
			if (oEvent && oEvent.getParameters().refreshButtonPressed) {
				// Search field's 'refresh' button has been pressed.
				// This is visible if you select any master list item.
				// In this case no new search is triggered, we only
				// refresh the list binding.
				this.byId("companiesList").getBinding("items").refresh();
				return;
			}

			// onSearch is also called if the exclude filter changed (no event)
			var sQuery = oEvent ? oEvent.getParameter("query") : this.byId("searchField").getValue(),
				aExcludeIDs = this.getModel("appView").getProperty("/excludeDisciplineIDs"),
				aFilters = [];

			for (var i = 0; i < aExcludeIDs.length; i++) {
				aFilters.push(new Filter("ID", FilterOperator.NE, aExcludeIDs[i]));
			}
			if (sQuery) {
				aFilters.push(new Filter("company/companyName", FilterOperator.Contains, sQuery));
			}
			if (aFilters.length > 0) {
				this.byId("companiesList").getBinding("items").filter(new Filter({
					filters: aFilters,
					and: true
				}));
			} else {
				this.byId("companiesList").getBinding("items").filter([], "Application");
			}
		},

		getDiscipline: function (oContext) {
			var oDiscipline = oContext.getProperty("discipline"),
				oGroup;
			if (oDiscipline) {
				oGroup = {
					key: oDiscipline.code,
					description: oDiscipline.description
				};
			} else {
				oGroup = {
					key: "",
					description: this.getResourceBundle().getText(noDisciplineAssigned)
				};
			}
			return oGroup;
		},

		createGroupHeader: function (oGroup) {
			return new GroupHeaderListItem({
				title: oGroup.key + " " + oGroup.description,
				upperCase: false
			});
		},

		onCloseDetailPress: function () {
			var sProjectID = this.getModel("appView").getProperty("/selectedProjectID");
			this.getModel("appView").setProperty("/actionButtonsInfo/endColumn/fullScreen", false);
			this.getRouter().navTo("object", {
				objectId: sProjectID
			});
		},

		toggleFullScreen: function () {
			var bFullScreen = this.getModel("appView").getProperty("/actionButtonsInfo/endColumn/fullScreen");
			this.getModel("appView").setProperty("/actionButtonsInfo/endColumn/fullScreen", !bFullScreen);
			if (!bFullScreen) {
				// store current layout and go full screen
				this.getModel("appView").setProperty("/previousLayout", this.getModel("appView").getProperty("/layout"));
				this.getModel("appView").setProperty("/layout", "EndColumnFullScreen");
			} else {
				// reset to previous layout
				this.getModel("appView").setProperty("/layout", this.getModel("appView").getProperty("/previousLayout"));
			}
		}

	});

});